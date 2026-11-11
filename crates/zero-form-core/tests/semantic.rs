use serde_json::json;
use std::{cell::Cell, path::PathBuf};
use zero_form_core::{
    contracts::*, definition::*, facts::*, mapping::*, package::read_json, prepare_application,
};

const NOW: &str = "2026-11-11";
fn fixtures() -> (DefinitionBundle, Request, FixtureSource) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    (
        read_json(&root.join("bench/demo/definition.json")).unwrap(),
        read_json(&root.join("bench/demo/request.json")).unwrap(),
        FixtureSource(read_json(&root.join("bench/demo/facts.json")).unwrap()),
    )
}
fn fact<'a>(source: &'a mut FixtureSource, predicate: &str) -> &'a mut Fact {
    source
        .0
        .facts
        .iter_mut()
        .find(|f| f.predicate == predicate)
        .unwrap()
}
fn approved(bundle: &DefinitionBundle, source: &mut FixtureSource) {
    source
        .0
        .approved_definition_hashes
        .insert(hash_json(bundle).unwrap());
}
fn ready(bundle: &DefinitionBundle, request: Request, source: &FixtureSource) -> Snapshot {
    let prepared = prepare_application(bundle, request, source, NOW).unwrap();
    assert!(prepared.issues.is_empty(), "{:?}", prepared.issues);
    prepared.snapshot
}

#[test]
fn one_snapshot_drives_five_documents_with_distinct_roles_and_provenance() {
    let (bundle, request, source) = fixtures();
    let snapshot = ready(&bundle, request, &source);
    assert_eq!(
        snapshot.fields["representative.name"].value(),
        Some(&json!("Alex Morgan"))
    );
    assert_eq!(
        snapshot.fields["contact.name"].value(),
        Some(&json!("Jamie Park"))
    );
    let plan = plan(&bundle, &snapshot).unwrap();
    assert_eq!(
        plan.documents
            .iter()
            .map(|d| d.id.as_str())
            .collect::<Vec<_>>(),
        [
            "01-overview",
            "02-official-form",
            "03-certificate",
            "04-branch--north",
            "04-branch--south"
        ]
    );
    let certificate = &plan.documents[2];
    let company = certificate
        .writes
        .iter()
        .find(|w| w.target_id == "company")
        .unwrap();
    assert_eq!(company.value, json!("HARBOR LABS"));
    assert_eq!(company.source_field, "company.name");
    assert_eq!(company.fact_id, "fact-01");
    assert_eq!(company.fact_revision, "1");
    source.authorize_publish(&bundle, &snapshot, NOW).unwrap();
}

#[test]
fn unauthorized_values_never_enter_snapshot_or_errors() {
    let (bundle, request, mut source) = fixtures();
    let secret = fact(&mut source, "email");
    secret.value = json!("private-not-authorized@example.test");
    let id = secret.id.clone();
    source.0.allowed_fact_ids.remove(&id);
    let prepared = prepare_application(&bundle, request, &source, NOW).unwrap();
    assert!(matches!(
        prepared.snapshot.fields["contact.email"],
        Resolved::Missing
    ));
    assert!(!prepared.issues.is_empty());
    assert!(
        !serde_json::to_string(&prepared)
            .unwrap()
            .contains("private-not-authorized")
    );
}

#[test]
fn access_scope_and_current_time_are_checked_separately_from_effective_date() {
    let (bundle, mut request, source) = fixtures();
    request.scope = "another-workspace".into();
    assert!(
        resolve(&bundle, request, &source, NOW)
            .unwrap_err()
            .to_string()
            .contains("scope_denied")
    );
    let (_, request, _) = fixtures();
    assert!(
        resolve(&bundle, request, &source, "2027-01-01")
            .unwrap_err()
            .to_string()
            .contains("grant_expired")
    );
}

#[test]
fn verification_event_does_not_grant_representative_authority() {
    let (bundle, request, mut source) = fixtures();
    source.0.allowed_relationship_ids.clear();
    let prepared = prepare_application(&bundle, request, &source, NOW).unwrap();
    assert!(matches!(
        prepared.snapshot.fields["representative.name"],
        Resolved::Known { .. }
    ));
    assert!(
        prepared
            .issues
            .iter()
            .any(|i| i.code == "missing_representative_authority")
    );
}

#[test]
fn unrelated_relationship_or_wrong_application_scope_does_not_authorize() {
    let (bundle, request, mut source) = fixtures();
    source.0.relationships[0].application_type = "other-application".into();
    let prepared = prepare_application(&bundle, request, &source, NOW).unwrap();
    assert!(
        prepared
            .issues
            .iter()
            .any(|i| i.code == "missing_representative_authority")
    );
}

#[test]
fn missing_verification_evidence_is_unknown_not_confirmed() {
    let (bundle, request, mut source) = fixtures();
    fact(&mut source, "name").verification_event = None;
    let prepared = prepare_application(&bundle, request, &source, NOW).unwrap();
    assert!(matches!(
        prepared.snapshot.fields["representative.name"],
        Resolved::Unknown
    ));
    assert!(!prepared.issues.is_empty());
}

#[test]
fn overlapping_effective_revisions_are_conflicts_not_latest_wins() {
    let (bundle, request, mut source) = fixtures();
    let mut conflict = fact(&mut source, "legal_name").clone();
    conflict.revision = "2".into();
    conflict.value = json!("Conflicting Labs");
    source.0.facts.push(conflict);
    let prepared = prepare_application(&bundle, request, &source, NOW).unwrap();
    assert!(matches!(
        prepared.snapshot.fields["company.name"],
        Resolved::Conflict { .. }
    ));
    assert!(prepared.issues.iter().any(|i| i.code == "fact_conflict"));
    assert!(plan(&bundle, &prepared.snapshot).is_err());
}

#[test]
fn unknown_conditions_cannot_silently_skip_documents() {
    let (mut bundle, request, mut source) = fixtures();
    bundle.application.schema["required"]
        .as_array_mut()
        .unwrap()
        .retain(|v| v != "application.certificate");
    bundle
        .application
        .rules
        .retain(|r| r.id != "certificate-email");
    bundle.application.documents[0]
        .bindings
        .remove("certificate");
    approved(&bundle, &mut source);
    fact(&mut source, "include_certificate").confirmation = Confirmation::Unknown;
    let prepared = prepare_application(&bundle, request, &source, NOW).unwrap();
    assert_eq!(
        condition(
            &bundle.application.documents[2].condition,
            &prepared.snapshot
        ),
        Truth::Unknown
    );
    assert!(
        prepared
            .issues
            .iter()
            .any(|i| i.message.contains("unknown_document_condition"))
    );
}

#[test]
fn explicit_false_omits_certificate_and_keeps_unchecked_mark_in_plan() {
    let (bundle, request, mut source) = fixtures();
    fact(&mut source, "include_certificate").value = json!(false);
    let snapshot = ready(&bundle, request, &source);
    let plan = plan(&bundle, &snapshot).unwrap();
    assert_eq!(plan.documents.len(), 4);
    assert_eq!(plan.not_applicable, ["03-certificate"]);
    assert_eq!(
        plan.documents[0]
            .writes
            .iter()
            .find(|w| w.target_id == "certificate")
            .unwrap()
            .value,
        json!(false)
    );
}

#[test]
fn repeated_records_require_unique_stable_ids() {
    let (bundle, request, mut source) = fixtures();
    fact(&mut source, "branches").value[1]["id"] = json!("north");
    let prepared = prepare_application(&bundle, request, &source, NOW).unwrap();
    assert!(
        prepared
            .issues
            .iter()
            .any(|i| i.message.contains("duplicate_output_document"))
    );
}

#[test]
fn updating_a_profile_produces_a_new_snapshot_without_mutating_the_previous_one() {
    let (bundle, request, mut source) = fixtures();
    let old = ready(&bundle, request.clone(), &source);
    let frozen = serde_json::to_vec(&old).unwrap();
    fact(&mut source, "legal_name").value = json!("Harbor Two");
    fact(&mut source, "legal_name").revision = "2".into();
    source.0.read_revision = "profile-bundle-v2".into();
    let new = ready(&bundle, request, &source);
    assert_ne!(new.hash, old.hash);
    assert_eq!(serde_json::to_vec(&old).unwrap(), frozen);
    assert_eq!(
        plan(&bundle, &old).unwrap().documents[0]
            .writes
            .iter()
            .find(|w| w.target_id == "company")
            .unwrap()
            .value,
        json!("Harbor Labs")
    );
    assert!(source.authorize_publish(&bundle, &old, NOW).is_err());
}

#[test]
fn rehashing_a_forged_value_does_not_make_it_authorized() {
    let (bundle, request, source) = fixtures();
    let mut snapshot = ready(&bundle, request, &source);
    let Resolved::Known { fact } = snapshot.fields.get_mut("company.name").unwrap() else {
        panic!()
    };
    fact.value = json!("Forged Company");
    assert!(check_snapshot(&bundle, &snapshot).is_err());
    snapshot.hash = snapshot_hash(&snapshot).unwrap();
    assert!(check_snapshot(&bundle, &snapshot).is_ok());
    assert!(source.authorize_publish(&bundle, &snapshot, NOW).is_err());
    snapshot
        .fields
        .insert("company.name".into(), Resolved::NotApplicable);
    snapshot.hash = snapshot_hash(&snapshot).unwrap();
    assert!(source.authorize_publish(&bundle, &snapshot, NOW).is_err());
}

#[test]
fn definition_changes_and_revoked_fact_access_invalidate_publication() {
    let (mut bundle, request, mut source) = fixtures();
    let snapshot = ready(&bundle, request, &source);
    source.0.allowed_fact_ids.remove("fact-01");
    assert!(source.authorize_publish(&bundle, &snapshot, NOW).is_err());
    bundle.application.version = "2.0.0".into();
    assert!(
        check_snapshot(&bundle, &snapshot)
            .unwrap_err()
            .to_string()
            .contains("definition_hash_mismatch")
    );
}

#[test]
fn exact_integer_sum_checks_mismatch_and_overflow() {
    let (bundle, request, mut source) = fixtures();
    fact(&mut source, "capital_total").value = json!(9999);
    let p = prepare_application(&bundle, request.clone(), &source, NOW).unwrap();
    assert!(p.issues.iter().any(|i| i.code == "sum_mismatch"));
    fact(&mut source, "first_contribution").value = json!(i64::MAX);
    let p = prepare_application(&bundle, request, &source, NOW).unwrap();
    assert!(p.issues.iter().any(|i| i.code == "amount_overflow"));
}

#[test]
fn invalid_definitions_fail_before_any_authorized_read() {
    struct CountReads {
        source: FixtureSource,
        reads: Cell<usize>,
    }
    impl FactSource for CountReads {
        fn read(&self, r: &Request, h: &str, now: &str) -> anyhow::Result<FactRead> {
            self.reads.set(self.reads.get() + 1);
            self.source.read(r, h, now)
        }
        fn authorize_publish(
            &self,
            b: &DefinitionBundle,
            s: &Snapshot,
            now: &str,
        ) -> anyhow::Result<()> {
            self.source.authorize_publish(b, s, now)
        }
    }
    let (mut bundle, request, source) = fixtures();
    let counted = CountReads {
        source,
        reads: Cell::new(0),
    };
    prepare_application(&bundle, request.clone(), &counted, NOW).unwrap();
    assert_eq!(counted.reads.get(), 1);
    bundle.application.schema["$ref"] = json!("https://example.test/remote-schema");
    assert!(prepare_application(&bundle, request, &counted, NOW).is_err());
    assert_eq!(counted.reads.get(), 1);
}

#[test]
fn signature_targets_and_overlapping_fields_are_rejected() {
    let (mut bundle, _, _) = fixtures();
    bundle
        .templates
        .get_mut("cover")
        .unwrap()
        .targets
        .get_mut("company")
        .unwrap()
        .filled_by = FilledBy::Signature;
    assert!(
        check_definition(&bundle)
            .unwrap_err()
            .to_string()
            .contains("protected_target")
    );
    let (mut bundle, _, _) = fixtures();
    let t = bundle.templates.get_mut("cover").unwrap();
    let rect = t.targets["company"].rect;
    t.targets.get_mut("contact").unwrap().rect = rect;
    assert!(
        check_definition(&bundle)
            .unwrap_err()
            .to_string()
            .contains("overlapping_targets")
    );
}

#[test]
fn closed_contracts_and_offline_schema_reject_ambiguous_inputs() {
    let (_, request, _) = fixtures();
    let mut raw = serde_json::to_value(request).unwrap();
    raw["authorized"] = json!(true);
    assert!(serde_json::from_value::<Request>(raw).is_err());
    let (mut bundle, _, _) = fixtures();
    bundle.application.documents[0]
        .bindings
        .get_mut("company")
        .unwrap()
        .source = ValueSource::Field {
        field: "nonexistent".into(),
    };
    assert!(check_definition(&bundle).is_err());
}

#[test]
fn transformations_are_explicit_and_require_matching_input() {
    assert_eq!(
        transform(&json!("2026-11-11"), &Transform::RocDate).unwrap(),
        json!("115/11/11")
    );
    assert_eq!(
        transform(
            &json!("Harbor Ltd"),
            &Transform::StripSuffix {
                suffix: " Ltd".into()
            }
        )
        .unwrap(),
        json!("Harbor")
    );
    assert!(
        transform(
            &json!("Harbor"),
            &Transform::StripSuffix {
                suffix: " Ltd".into()
            }
        )
        .is_err()
    );
    assert_eq!(
        hash_json(&json!({"b":2,"a":1})).unwrap(),
        hash_json(&json!({"a":1,"b":2})).unwrap()
    );
    assert!(date("2026-02-30").is_err());
    assert!(safe_id("../escape").is_err());
}
