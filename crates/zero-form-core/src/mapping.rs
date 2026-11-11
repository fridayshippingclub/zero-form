use crate::{contracts::*, definition::*};
use anyhow::{Context, Result, bail, ensure};
use chrono::Datelike;
use serde_json::{Value, json};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Truth {
    True,
    False,
    Unknown,
}
pub fn condition(c: &Condition, s: &Snapshot) -> Truth {
    match c {
        Condition::Always => Truth::True,
        Condition::Equals { field, value } => match s.fields.get(field).and_then(Resolved::value) {
            Some(v) if v == value => Truth::True,
            Some(_) => Truth::False,
            None => Truth::Unknown,
        },
        Condition::Present { field } => match s.fields.get(field) {
            Some(Resolved::Known { .. }) => Truth::True,
            Some(Resolved::NotApplicable) => Truth::False,
            _ => Truth::Unknown,
        },
        Condition::Not { condition: c } => match condition(c, s) {
            Truth::True => Truth::False,
            Truth::False => Truth::True,
            Truth::Unknown => Truth::Unknown,
        },
        Condition::All { conditions } => {
            let v = conditions
                .iter()
                .map(|c| condition(c, s))
                .collect::<Vec<_>>();
            if v.contains(&Truth::False) {
                Truth::False
            } else if v.contains(&Truth::Unknown) {
                Truth::Unknown
            } else {
                Truth::True
            }
        }
        Condition::Any { conditions } => {
            let v = conditions
                .iter()
                .map(|c| condition(c, s))
                .collect::<Vec<_>>();
            if v.contains(&Truth::True) {
                Truth::True
            } else if v.contains(&Truth::Unknown) {
                Truth::Unknown
            } else {
                Truth::False
            }
        }
    }
}
pub fn application_data(s: &Snapshot) -> Value {
    Value::Object(
        s.fields
            .iter()
            .filter_map(|(k, v)| v.value().map(|v| (k.clone(), v.clone())))
            .collect(),
    )
}
fn field<'a>(s: &'a Snapshot, name: &str) -> Result<&'a Value> {
    s.fields
        .get(name)
        .and_then(Resolved::value)
        .context("unresolved_field")
}
fn validate_rule(rule: &Rule, s: &Snapshot) -> Result<()> {
    match &rule.check {
        RuleCheck::RequiredWhen {
            condition: c,
            field: f,
        } => match condition(c, s) {
            Truth::True => {
                field(s, f)?;
            }
            Truth::Unknown => bail!("unknown_condition"),
            Truth::False => {}
        },
        RuleCheck::Equal { left, right } => {
            ensure!(field(s, left)? == field(s, right)?, "values_differ")
        }
        RuleCheck::OneOf { field: f, values } => {
            ensure!(values.contains(field(s, f)?), "invalid_choice")
        }
        RuleCheck::Sum { fields, total, .. } => {
            let sum = fields.iter().try_fold(0i64, |acc, f| {
                acc.checked_add(field(s, f)?.as_i64().context("integer_amount_required")?)
                    .context("amount_overflow")
            })?;
            ensure!(Some(sum) == field(s, total)?.as_i64(), "sum_mismatch");
        }
        RuleCheck::DateBefore { earlier, later } => ensure!(
            date(
                field(s, earlier)?
                    .as_str()
                    .context("date_string_required")?
            )? <= date(field(s, later)?.as_str().context("date_string_required")?)?,
            "date_order"
        ),
        RuleCheck::Relationship {
            from_role,
            to_role,
            relation,
        } => {
            let from = s.request.roles.get(from_role).context("missing_role")?;
            let to = s.request.roles.get(to_role).context("missing_role")?;
            let ok = s.relationships.iter().any(|r| {
                r.from == *from
                    && r.to == *to
                    && r.kind == *relation
                    && r.application_type == s.request.application_type
                    && active(&r.valid_from, r.valid_to.as_deref(), &s.request.as_of)
                        .unwrap_or(false)
            });
            ensure!(ok, "missing_representative_authority");
        }
        RuleCheck::ChoiceCount { fields, min, max } => {
            let mut selected = 0;
            for f in fields {
                if field(s, f)?.as_bool().context("boolean_choice_required")? {
                    selected += 1;
                }
            }
            ensure!((*min..=*max).contains(&selected), "choice_cardinality");
        }
    }
    Ok(())
}
pub fn validate(bundle: &DefinitionBundle, s: &Snapshot) -> Result<Vec<Issue>> {
    crate::facts::check_snapshot(bundle, s)?;
    let mut issues = Vec::new();
    for (name, v) in &s.fields {
        if matches!(v, Resolved::Conflict { .. }) {
            issues.push(Issue {
                code: "fact_conflict".into(),
                location: name.clone(),
                message: "Multiple effective facts require an explicit resolution.".into(),
            });
        }
    }
    let data = application_data(s);
    let validator = jsonschema::options()
        .with_draft(jsonschema::Draft::Draft202012)
        .should_validate_formats(true)
        .build(&bundle.application.schema)?;
    for error in validator.iter_errors(&data) {
        let mut location = error.instance_path().to_string();
        if let jsonschema::error::ValidationErrorKind::Required { property } = error.kind()
            && let Some(name) = property.as_str()
        {
            location.push('/');
            location.push_str(&name.replace('~', "~0").replace('/', "~1"));
        }
        issues.push(Issue {
            code: "schema_validation".into(),
            location,
            message: "Application data does not satisfy its registered schema.".into(),
        });
    }
    for rule in &bundle.application.rules {
        if let Err(error) = validate_rule(rule, s) {
            issues.push(Issue {
                code: error.to_string(),
                location: rule.id.clone(),
                message: "The registered application rule is not satisfied.".into(),
            });
        }
    }
    Ok(issues)
}
pub fn transform(value: &Value, t: &Transform) -> Result<Value> {
    let text = || value.as_str().context("text_required");
    Ok(match t {
        Transform::Identity => value.clone(),
        Transform::Uppercase => json!(text()?.to_uppercase()),
        Transform::RocDate => {
            let d = date(text()?)?;
            ensure!(d.year() >= 1912, "unsupported_roc_date");
            json!(format!(
                "{}/{:02}/{:02}",
                d.year() - 1911,
                d.month(),
                d.day()
            ))
        }
        Transform::Join { separator } => json!(
            value
                .as_array()
                .context("array_required")?
                .iter()
                .map(|v| v.as_str().context("text_array_required"))
                .collect::<Result<Vec<_>>>()?
                .join(separator)
        ),
        Transform::Affix { prefix, suffix } => json!(format!("{prefix}{}{suffix}", text()?)),
        Transform::StripSuffix { suffix } => json!(
            text()?
                .strip_suffix(suffix)
                .context("fixed_suffix_mismatch")?
        ),
    })
}
pub fn plan(bundle: &DefinitionBundle, s: &Snapshot) -> Result<ApplicationPlan> {
    ensure!(
        validate(bundle, s)?.is_empty(),
        "application_validation_failed"
    );
    let mut result = ApplicationPlan {
        documents: vec![],
        not_applicable: vec![],
    };
    let mut ids = BTreeSet::new();
    for doc in &bundle.application.documents {
        match condition(&doc.condition, s) {
            Truth::False => {
                result.not_applicable.push(doc.id.clone());
                continue;
            }
            Truth::Unknown => bail!("unknown_document_condition: {}", doc.id),
            Truth::True => {}
        }
        let records = if let Some(f) = &doc.repeat_field {
            let arr = field(s, f)?.as_array().context("repeat_array_required")?;
            ensure!(!arr.is_empty() && arr.len() <= 32, "invalid_repeat_count");
            arr.iter().map(Some).collect::<Vec<_>>()
        } else {
            vec![None]
        };
        for item in records {
            let id = if let Some(item) = item {
                let id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .context("repeat_record_id_required")?;
                safe_id(id)?;
                format!("{}--{}", doc.id, id)
            } else {
                doc.id.clone()
            };
            ensure!(ids.insert(id.clone()), "duplicate_output_document");
            let template = &bundle.templates[&doc.template];
            let mut writes = Vec::new();
            for (target_id, binding) in &doc.bindings {
                let source_field = match &binding.source {
                    ValueSource::Field { field } => field,
                    ValueSource::Item { .. } => {
                        doc.repeat_field.as_ref().context("repeat_field_required")?
                    }
                };
                let Resolved::Known { fact } =
                    s.fields.get(source_field).context("unknown_source_field")?
                else {
                    bail!("unresolved_mapping_field: {source_field}");
                };
                let raw = match &binding.source {
                    ValueSource::Field { .. } => &fact.value,
                    ValueSource::Item { pointer } => item
                        .and_then(|i| i.pointer(pointer))
                        .context("missing_record_value")?,
                };
                let value = transform(raw, &binding.transform)?;
                let target = template.targets[target_id].clone();
                match target.control {
                    TargetKind::Text { .. } => ensure!(
                        value.as_str().is_some_and(|s| !s.is_empty()
                            && s.len() <= 2048
                            && !s.chars().any(char::is_control)),
                        "invalid_text_value"
                    ),
                    TargetKind::Checkbox => ensure!(value.is_boolean(), "boolean_choice_required"),
                }
                writes.push(Write {
                    target_id: target_id.clone(),
                    target,
                    value,
                    source_field: source_field.clone(),
                    fact_id: fact.id.clone(),
                    fact_revision: fact.revision.clone(),
                    source_ref: fact.source.clone(),
                    transform: binding.transform.clone(),
                });
            }
            result.documents.push(DocumentPlan {
                id,
                template: doc.template.clone(),
                writes,
            });
        }
    }
    ensure!(
        !result.documents.is_empty() && result.documents.len() <= 64,
        "invalid_output_count"
    );
    Ok(result)
}
