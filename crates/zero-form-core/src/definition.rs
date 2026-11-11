use crate::contracts::*;
use anyhow::{Context, Result, ensure};
use chrono::NaiveDate;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

pub fn hash_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn hash_json(value: &impl Serialize) -> Result<String> {
    // serde_json's default map representation sorts keys recursively.
    Ok(hash_bytes(&serde_json::to_vec(&serde_json::to_value(
        value,
    )?)?))
}
pub fn date(value: &str) -> Result<NaiveDate> {
    ensure!(value.len() == 10, "invalid_date");
    NaiveDate::parse_from_str(value, "%Y-%m-%d").context("invalid_date")
}
pub fn active(from: &str, to: Option<&str>, on: &str) -> Result<bool> {
    let start = date(from)?;
    let day = date(on)?;
    if let Some(end) = to {
        let end = date(end)?;
        ensure!(end >= start, "invalid_interval");
        Ok(day >= start && day <= end)
    } else {
        Ok(day >= start)
    }
}
pub fn safe_id(value: &str) -> Result<()> {
    ensure!(
        !value.is_empty()
            && value.len() <= 80
            && value
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
        "invalid_identifier"
    );
    Ok(())
}
pub fn asset_path(root: &Path, asset: &Asset) -> Result<PathBuf> {
    let relative = Path::new(&asset.path);
    ensure!(
        !relative.is_absolute()
            && relative
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_))),
        "unsafe_asset_path"
    );
    let root = root.canonicalize()?;
    let path = root.join(relative).canonicalize()?;
    ensure!(path.starts_with(root), "asset_outside_root");
    ensure!(
        fs::metadata(&path)?.len() <= 32 * 1024 * 1024,
        "asset_too_large"
    );
    ensure!(
        hash_bytes(&fs::read(&path)?) == asset.sha256,
        "asset_hash_mismatch"
    );
    Ok(path)
}
fn condition_refs(c: &Condition, fields: &BTreeSet<&String>, depth: usize) -> Result<()> {
    ensure!(depth <= 16, "condition_too_deep");
    match c {
        Condition::Always => {}
        Condition::Equals { field, .. } | Condition::Present { field } => {
            ensure!(fields.contains(field), "unknown_condition_field")
        }
        Condition::All { conditions } | Condition::Any { conditions } => {
            ensure!(
                !conditions.is_empty() && conditions.len() <= 64,
                "invalid_condition_group"
            );
            for c in conditions {
                condition_refs(c, fields, depth + 1)?;
            }
        }
        Condition::Not { condition } => condition_refs(condition, fields, depth + 1)?,
    }
    Ok(())
}
fn offline_schema(value: &Value, depth: usize) -> Result<()> {
    ensure!(depth <= 32, "schema_too_deep");
    match value {
        Value::Object(map) => {
            for (key, v) in map {
                ensure!(
                    !["$ref", "$dynamicRef", "$recursiveRef", "$id"].contains(&key.as_str()),
                    "schema_references_not_supported"
                );
                offline_schema(v, depth + 1)?;
            }
        }
        Value::Array(a) => {
            for v in a {
                offline_schema(v, depth + 1)?;
            }
        }
        _ => {}
    }
    Ok(())
}
pub fn check_definition(bundle: &DefinitionBundle) -> Result<()> {
    ensure!(bundle.schema_version == 1, "unsupported_schema_version");
    let a = &bundle.application;
    safe_id(&a.id)?;
    ensure!(!a.version.is_empty(), "missing_definition_version");
    active(&a.valid_from, a.valid_to.as_deref(), &a.valid_from)?;
    ensure!(
        !a.fields.is_empty() && a.fields.len() <= 256,
        "invalid_field_count"
    );
    let fields: BTreeSet<_> = a.fields.keys().collect();
    offline_schema(&a.schema, 0)?;
    ensure!(
        a.schema.get("type").and_then(Value::as_str) == Some("object")
            && a.schema.get("additionalProperties") == Some(&Value::Bool(false)),
        "schema_requires_closed_object"
    );
    let properties = a
        .schema
        .get("properties")
        .and_then(Value::as_object)
        .context("schema_missing_properties")?;
    ensure!(
        properties.keys().collect::<BTreeSet<_>>() == fields,
        "schema_field_mismatch"
    );
    jsonschema::options()
        .with_draft(jsonschema::Draft::Draft202012)
        .should_validate_formats(true)
        .build(&a.schema)
        .context("invalid_application_schema")?;
    if let Some(required) = a.schema.get("required") {
        for name in required.as_array().context("invalid_required")? {
            ensure!(
                a.fields
                    .contains_key(name.as_str().context("invalid_required")?),
                "unknown_required_field"
            );
        }
    }
    for f in a.fields.values() {
        safe_id(&f.role)?;
        ensure!(!f.predicate.is_empty(), "empty_predicate");
    }
    let mut rules = BTreeSet::new();
    for rule in &a.rules {
        safe_id(&rule.id)?;
        ensure!(
            rules.insert(&rule.id) && !rule.source.is_empty() && !rule.version.is_empty(),
            "invalid_rule"
        );
        let refs = match &rule.check {
            RuleCheck::RequiredWhen { condition, field } => {
                condition_refs(condition, &fields, 0)?;
                vec![field]
            }
            RuleCheck::Equal { left, right } => vec![left, right],
            RuleCheck::OneOf { field, values } => {
                ensure!(!values.is_empty(), "empty_enum");
                vec![field]
            }
            RuleCheck::Sum {
                fields,
                total,
                unit,
            } => {
                ensure!(!unit.is_empty() && !fields.is_empty(), "invalid_sum");
                let mut v = fields.iter().collect::<Vec<_>>();
                v.push(total);
                v
            }
            RuleCheck::DateBefore { earlier, later } => vec![earlier, later],
            RuleCheck::Relationship {
                from_role,
                to_role,
                relation,
            } => {
                safe_id(from_role)?;
                safe_id(to_role)?;
                ensure!(!relation.is_empty(), "invalid_relation");
                vec![]
            }
            RuleCheck::ChoiceCount { fields, min, max } => {
                ensure!(
                    min <= max && *max <= fields.len(),
                    "invalid_choice_cardinality"
                );
                fields.iter().collect()
            }
        };
        for field in refs {
            ensure!(fields.contains(field), "unknown_rule_field");
        }
    }
    ensure!(
        !a.documents.is_empty() && a.documents.len() <= 32,
        "invalid_document_count"
    );
    let mut doc_ids = BTreeSet::new();
    for d in &a.documents {
        safe_id(&d.id)?;
        ensure!(doc_ids.insert(&d.id), "duplicate_document");
        condition_refs(&d.condition, &fields, 0)?;
        if let Some(repeat) = &d.repeat_field {
            ensure!(fields.contains(repeat), "unknown_repeat_field");
        }
        let t = bundle
            .templates
            .get(&d.template)
            .context("unknown_template")?;
        ensure!(!d.bindings.is_empty(), "empty_mapping");
        for (target, binding) in &d.bindings {
            let target = t.targets.get(target).context("unknown_target")?;
            ensure!(target.filled_by == FilledBy::Applicant, "protected_target");
            match &binding.source {
                ValueSource::Field { field } => {
                    ensure!(fields.contains(field), "unknown_mapping_field")
                }
                ValueSource::Item { pointer } => ensure!(
                    d.repeat_field.is_some() && pointer.starts_with('/'),
                    "invalid_item_reference"
                ),
            }
        }
    }
    ensure!(bundle.templates.len() <= 32, "too_many_templates");
    for (id, t) in &bundle.templates {
        safe_id(id)?;
        ensure!(
            !t.version.is_empty() && !t.font.family.is_empty() && !t.targets.is_empty(),
            "invalid_template"
        );
        ensure!(t.targets.len() <= 256, "too_many_targets");
        for (id, f) in &t.targets {
            safe_id(id)?;
            let [x, y, w, h] = f.rect;
            ensure!(
                f.page > 0
                    && f.rect.iter().all(|v| v.is_finite())
                    && x >= 0.
                    && y >= 0.
                    && w >= 4.
                    && h >= 4.,
                "invalid_target_geometry"
            );
            if let TargetKind::Text { size } = f.control {
                ensure!(
                    size.is_finite() && (6. ..=36.).contains(&size),
                    "invalid_font_size"
                );
            }
        }
        let targets = t.targets.values().collect::<Vec<_>>();
        for (i, a) in targets.iter().enumerate() {
            for b in &targets[i + 1..] {
                let [x, y, w, h] = a.rect;
                let [xx, yy, ww, hh] = b.rect;
                ensure!(
                    a.page != b.page || x + w <= xx || xx + ww <= x || y + h <= yy || yy + hh <= y,
                    "overlapping_targets"
                );
            }
        }
    }
    Ok(())
}
