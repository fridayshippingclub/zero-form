use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    process::{Command, Output},
};

fn prepare(dir: &std::path::Path, facts: &std::path::Path) -> Output {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    Command::new(env!("CARGO_BIN_EXE_zero-form"))
        .current_dir(dir)
        .arg("prepare")
        .arg("--definition")
        .arg(root.join("bench/demo/definition.json"))
        .arg("--request")
        .arg(root.join("bench/demo/request.json"))
        .arg("--fixture-facts")
        .arg(facts)
        .args(["--now", "2026-11-11", "--out", "snapshot.json"])
        .output()
        .unwrap()
}

#[test]
fn prepare_writes_a_snapshot_once_and_returns_json_errors_without_overwriting() {
    let dir = tempfile::tempdir().unwrap();
    let facts = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../bench/demo/facts.json");
    let first = prepare(dir.path(), &facts);
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    let result: Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(result["status"], "prepared");
    let snapshot = fs::read(dir.path().join("snapshot.json")).unwrap();
    let second = prepare(dir.path(), &facts);
    assert_eq!(second.status.code(), Some(1));
    let failure: Value = serde_json::from_slice(&second.stderr).unwrap();
    assert_eq!(failure["status"], "error");
    assert_eq!(
        fs::read(dir.path().join("snapshot.json")).unwrap(),
        snapshot
    );
}

#[test]
fn missing_data_is_actionable_on_stdout_and_has_a_nonzero_exit() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut facts: Value =
        serde_json::from_slice(&fs::read(root.join("bench/demo/facts.json")).unwrap()).unwrap();
    facts["allowed_fact_ids"]
        .as_array_mut()
        .unwrap()
        .retain(|id| id != "fact-05");
    let dir = tempfile::tempdir().unwrap();
    let facts_path = dir.path().join("facts.json");
    fs::write(&facts_path, serde_json::to_vec(&facts).unwrap()).unwrap();
    let result = prepare(dir.path(), &facts_path);
    assert_eq!(result.status.code(), Some(1));
    let prepared: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(
        prepared["snapshot"]["fields"]["contact.email"],
        json!({"state":"missing"})
    );
    assert!(
        prepared["issues"]
            .as_array()
            .unwrap()
            .iter()
            .any(|i| i["location"] == "/contact.email")
    );
    let error: Value = serde_json::from_slice(&result.stderr).unwrap();
    assert_eq!(error["code"], "application_needs_data");
    assert!(!String::from_utf8_lossy(&result.stdout).contains("jamie@example.test"));
}

#[test]
fn schema_exports_actual_input_contracts() {
    let result = Command::new(env!("CARGO_BIN_EXE_zero-form"))
        .arg("schema")
        .output()
        .unwrap();
    assert!(result.status.success());
    let schemas: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(schemas["request"]["additionalProperties"], false);
    assert!(schemas["definition"]["$defs"]["DefinitionBundle"].is_null());
    assert!(schemas["definition"]["properties"]["application"].is_object());
    assert!(schemas["fixture_facts"]["properties"]["allowed_fact_ids"].is_object());
}
