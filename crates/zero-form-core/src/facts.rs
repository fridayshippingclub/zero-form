use crate::{contracts::*, definition::*};
use anyhow::{Context, Result, ensure};
use std::collections::{BTreeMap, BTreeSet};

/// Implemented by the trusted host. Raw client JSON is not an authorization provider.
pub trait FactSource {
    fn read(&self, request: &Request, definition_hash: &str, now: &str) -> Result<FactRead>;
    fn authorize_publish(
        &self,
        bundle: &DefinitionBundle,
        snapshot: &Snapshot,
        now: &str,
    ) -> Result<()>;
}
pub struct FactRead {
    pub revision: String,
    pub grant_id: String,
    pub trust_mode: String,
    pub facts: Vec<Fact>,
    pub relationships: Vec<Relationship>,
}
pub struct FixtureSource(pub FixtureFacts);
impl FactSource for FixtureSource {
    fn read(&self, request: &Request, definition_hash: &str, now: &str) -> Result<FactRead> {
        ensure!(self.0.scope == request.scope, "scope_denied");
        ensure!(date(now)? <= date(&self.0.expires_on)?, "grant_expired");
        ensure!(
            self.0.approved_definition_hashes.contains(definition_hash),
            "definition_not_approved"
        );
        Ok(FactRead {
            revision: self.0.read_revision.clone(),
            grant_id: self.0.grant_id.clone(),
            trust_mode: "fixture_only".into(),
            facts: self
                .0
                .facts
                .iter()
                .filter(|f| self.0.allowed_fact_ids.contains(&f.id))
                .cloned()
                .collect(),
            relationships: self
                .0
                .relationships
                .iter()
                .filter(|r| self.0.allowed_relationship_ids.contains(&r.id))
                .cloned()
                .collect(),
        })
    }
    fn authorize_publish(
        &self,
        bundle: &DefinitionBundle,
        snapshot: &Snapshot,
        now: &str,
    ) -> Result<()> {
        // Fixture grants authorize a complete read version. Re-resolving also
        // authenticates Missing/Unknown states, which a content hash alone cannot.
        let expected = resolve(bundle, snapshot.request.clone(), self, now)?;
        ensure!(
            hash_json(&expected)? == hash_json(snapshot)?,
            "snapshot_not_authorized"
        );
        Ok(())
    }
}
pub fn resolve(
    bundle: &DefinitionBundle,
    request: Request,
    source: &dyn FactSource,
    now: &str,
) -> Result<Snapshot> {
    check_definition(bundle)?;
    safe_id(&request.id)?;
    ensure!(!request.scope.is_empty(), "missing_scope");
    ensure!(
        request.application_type == bundle.application.id,
        "application_type_mismatch"
    );
    ensure!(
        active(
            &bundle.application.valid_from,
            bundle.application.valid_to.as_deref(),
            &request.as_of
        )?,
        "definition_not_effective"
    );
    let definition_hash = hash_json(bundle)?;
    let read = source.read(&request, &definition_hash, now)?;
    ensure!(
        !read.revision.is_empty() && !read.grant_id.is_empty(),
        "missing_read_evidence"
    );
    ensure!(
        read.facts.len() <= 4096 && read.relationships.len() <= 4096,
        "fact_bundle_too_large"
    );
    let mut identities = BTreeSet::new();
    for f in &read.facts {
        ensure!(
            identities.insert((&f.id, &f.revision)),
            "duplicate_fact_revision"
        );
        ensure!(
            !f.id.is_empty() && !f.revision.is_empty() && !f.source.is_empty(),
            "invalid_fact_evidence"
        );
        active(&f.valid_from, f.valid_to.as_deref(), &request.as_of)?;
    }
    let mut relationship_ids = BTreeSet::new();
    for r in &read.relationships {
        ensure!(
            relationship_ids.insert((&r.id, &r.revision)),
            "duplicate_relationship_revision"
        );
        ensure!(
            !r.id.is_empty() && !r.revision.is_empty() && !r.source.is_empty(),
            "invalid_relationship_evidence"
        );
        active(&r.valid_from, r.valid_to.as_deref(), &request.as_of)?;
    }
    let mut fields = BTreeMap::new();
    for (name, field) in &bundle.application.fields {
        let entity = request
            .roles
            .get(&field.role)
            .context("missing_role_binding")?;
        let candidates = read
            .facts
            .iter()
            .filter(|f| f.subject == *entity && f.predicate == field.predicate)
            .filter(|f| {
                active(&f.valid_from, f.valid_to.as_deref(), &request.as_of).unwrap_or(false)
            })
            .collect::<Vec<_>>();
        let resolved = match candidates.as_slice() {
            [] => Resolved::Missing,
            [f] => match f.confirmation {
                Confirmation::NotApplicable => Resolved::NotApplicable,
                Confirmation::Unknown => Resolved::Unknown,
                Confirmation::Confirmed
                    if field.require_verification_event
                        && f.verification_event.as_ref().is_none_or(|e| e.is_empty()) =>
                {
                    Resolved::Unknown
                }
                Confirmation::Confirmed => Resolved::Known {
                    fact: Box::new((*f).clone()),
                },
            },
            _ => Resolved::Conflict {
                fact_ids: candidates.iter().map(|f| f.id.clone()).collect(),
            },
        };
        fields.insert(name.clone(), resolved);
    }
    let mut relationships = Vec::new();
    for rule in &bundle.application.rules {
        if let RuleCheck::Relationship {
            from_role,
            to_role,
            relation,
        } = &rule.check
        {
            let from = request
                .roles
                .get(from_role)
                .context("missing_relation_role")?;
            let to = request
                .roles
                .get(to_role)
                .context("missing_relation_role")?;
            for r in &read.relationships {
                if r.from == *from
                    && r.to == *to
                    && r.kind == *relation
                    && r.application_type == request.application_type
                    && active(&r.valid_from, r.valid_to.as_deref(), &request.as_of)?
                {
                    ensure!(
                        !r.id.is_empty() && !r.revision.is_empty() && !r.source.is_empty(),
                        "invalid_relationship_evidence"
                    );
                    relationships.push(r.clone());
                }
            }
        }
    }
    relationships.sort_by(|a, b| a.id.cmp(&b.id));
    relationships.dedup_by(|a, b| a.id == b.id && a.revision == b.revision);
    let mut snapshot = Snapshot {
        schema_version: 1,
        request,
        definition_hash,
        read_revision: read.revision,
        grant_id: read.grant_id,
        trust_mode: read.trust_mode,
        fields,
        relationships,
        hash: String::new(),
    };
    snapshot.hash = snapshot_hash(&snapshot)?;
    Ok(snapshot)
}
pub fn snapshot_hash(snapshot: &Snapshot) -> Result<String> {
    let mut s = snapshot.clone();
    s.hash.clear();
    hash_json(&s)
}
pub fn check_snapshot(bundle: &DefinitionBundle, snapshot: &Snapshot) -> Result<()> {
    check_definition(bundle)?;
    ensure!(
        snapshot.schema_version == 1 && snapshot.hash == snapshot_hash(snapshot)?,
        "snapshot_hash_mismatch"
    );
    ensure!(
        snapshot.definition_hash == hash_json(bundle)?,
        "definition_hash_mismatch"
    );
    ensure!(
        snapshot.request.application_type == bundle.application.id,
        "application_type_mismatch"
    );
    safe_id(&snapshot.request.id)?;
    ensure!(
        active(
            &bundle.application.valid_from,
            bundle.application.valid_to.as_deref(),
            &snapshot.request.as_of
        )?,
        "definition_not_effective"
    );
    ensure!(
        snapshot.fields.keys().eq(bundle.application.fields.keys()),
        "snapshot_fields_mismatch"
    );
    for (name, resolved) in &snapshot.fields {
        if let Resolved::Known { fact } = resolved {
            let field = &bundle.application.fields[name];
            ensure!(
                snapshot.request.roles.get(&field.role) == Some(&fact.subject)
                    && fact.predicate == field.predicate
                    && fact.confirmation == Confirmation::Confirmed,
                "snapshot_fact_mismatch"
            );
            ensure!(
                active(
                    &fact.valid_from,
                    fact.valid_to.as_deref(),
                    &snapshot.request.as_of
                )?,
                "snapshot_fact_expired"
            );
            ensure!(
                !field.require_verification_event
                    || fact
                        .verification_event
                        .as_ref()
                        .is_some_and(|s| !s.is_empty()),
                "snapshot_evidence_missing"
            );
        }
    }
    Ok(())
}
