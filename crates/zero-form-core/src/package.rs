use crate::{
    contracts::*,
    definition::*,
    facts::FactSource,
    pdf::{Tools, doctor},
    verification::DocumentVerification,
};
use anyhow::{Context, Result, ensure};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    fs::write(path, serde_json::to_vec_pretty(value)?)?;
    Ok(())
}
pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    ensure!(
        fs::metadata(path)?.len() <= 8 * 1024 * 1024,
        "json_too_large"
    );
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Verification {
    pub status: String,
    pub snapshot_hash: String,
    pub definition_hash: String,
    pub renderer_versions: serde_json::Value,
    pub documents: Vec<DocumentVerification>,
}
pub fn render_application(
    bundle: &DefinitionBundle,
    snapshot: &Snapshot,
    assets: &Path,
    candidate: &Path,
    tools: &Tools,
) -> Result<()> {
    crate::facts::check_snapshot(bundle, snapshot)?;
    let plan = crate::mapping::plan(bundle, snapshot)?;
    ensure!(!candidate.exists(), "candidate_already_exists");
    let parent = candidate.parent().context("candidate_parent_required")?;
    fs::create_dir_all(parent)?;
    let temp = tempfile::Builder::new()
        .prefix(".zero-form-")
        .tempdir_in(parent)?;
    let root = temp.path();
    fs::create_dir(root.join("documents"))?;
    for doc in &plan.documents {
        let work = root.join("work").join(&doc.id);
        crate::pdf::render_document(&bundle.templates[&doc.template], doc, assets, &work, tools)?;
        fs::copy(
            work.join("candidate.pdf"),
            root.join("documents").join(format!("{}.pdf", doc.id)),
        )?;
    }
    write_json(&root.join("application.snapshot.json"), snapshot)?;
    write_json(
        &root.join("application.data.json"),
        &crate::mapping::application_data(snapshot),
    )?;
    write_json(&root.join("provenance.json"), &plan)?;
    write_json(&root.join("definition.json"), bundle)?;
    // This manifest is descriptive only. Publication recomputes every check.
    write_json(
        &root.join("manifest.json"),
        &json!({"schema_version":1,"state":"candidate","snapshot_hash":snapshot.hash,"definition_hash":snapshot.definition_hash,"trust_mode":snapshot.trust_mode,"not_applicable":plan.not_applicable,"documents":plan.documents.iter().map(|d|json!({"id":d.id,"path":format!("documents/{}.pdf",d.id),"role":"submission_document","template":d.template})).collect::<Vec<_>>(),"internal_artifacts":["application.snapshot.json","application.data.json","definition.json","provenance.json","validation.json"]}),
    )?;
    // Only job-owned scratch material is removed, never caller-owned paths.
    fs::remove_dir_all(root.join("work"))?;
    fs::rename(root, candidate)?;
    Ok(())
}
pub fn verify_application(
    bundle: &DefinitionBundle,
    snapshot: &Snapshot,
    assets: &Path,
    candidate: &Path,
    tools: &Tools,
) -> Result<Verification> {
    crate::facts::check_snapshot(bundle, snapshot)?;
    let stored: Snapshot = read_json(&candidate.join("application.snapshot.json"))?;
    ensure!(
        hash_json(&stored)? == hash_json(snapshot)?,
        "candidate_snapshot_mismatch"
    );
    let stored_bundle: DefinitionBundle = read_json(&candidate.join("definition.json"))?;
    ensure!(
        hash_json(&stored_bundle)? == hash_json(bundle)?,
        "candidate_definition_mismatch"
    );
    let stored_data: serde_json::Value = read_json(&candidate.join("application.data.json"))?;
    ensure!(
        stored_data == crate::mapping::application_data(snapshot),
        "candidate_data_mismatch"
    );
    let plan = crate::mapping::plan(bundle, snapshot)?;
    let stored_plan: ApplicationPlan = read_json(&candidate.join("provenance.json"))?;
    ensure!(
        hash_json(&plan)? == hash_json(&stored_plan)?,
        "candidate_mapping_mismatch"
    );
    let expected = plan
        .documents
        .iter()
        .map(|d| format!("{}.pdf", d.id))
        .collect::<std::collections::BTreeSet<_>>();
    let actual = fs::read_dir(candidate.join("documents"))?
        .map(|entry| -> Result<String> {
            let e = entry?;
            ensure!(e.file_type()?.is_file(), "unexpected_document_entry");
            e.file_name()
                .into_string()
                .map_err(|_| anyhow::anyhow!("invalid_filename"))
        })
        .collect::<Result<std::collections::BTreeSet<_>>>()?;
    ensure!(expected == actual, "document_set_mismatch");
    let renderer_versions = doctor(tools)?;
    let mut documents = Vec::new();
    for d in &plan.documents {
        documents.push(crate::verification::verify_document(
            &bundle.templates[&d.template],
            d,
            assets,
            &candidate.join("documents").join(format!("{}.pdf", d.id)),
            tools,
        )?);
    }
    Ok(Verification {
        status: "passed".into(),
        snapshot_hash: snapshot.hash.clone(),
        definition_hash: snapshot.definition_hash.clone(),
        renderer_versions,
        documents,
    })
}
pub struct PublicationPaths<'a> {
    pub assets: &'a Path,
    pub candidate: &'a Path,
    pub output: &'a Path,
}
pub fn publish_application(
    bundle: &DefinitionBundle,
    snapshot: &Snapshot,
    paths: PublicationPaths<'_>,
    source: &dyn FactSource,
    now: &str,
    tools: &Tools,
) -> Result<PathBuf> {
    let PublicationPaths {
        assets,
        candidate,
        output,
    } = paths;
    source.authorize_publish(bundle, snapshot, now)?;
    let parent = output.parent().context("output_parent_required")?;
    fs::create_dir_all(parent)?;
    let name = output
        .file_name()
        .and_then(|n| n.to_str())
        .context("invalid_output_name")?;
    safe_id(name)?;
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(parent.join(format!(".{name}.lock")))?;
    lock.try_lock_exclusive().context("publication_conflict")?;
    ensure!(!output.exists(), "output_already_exists");
    let staging = tempfile::Builder::new()
        .prefix(".publish-")
        .tempdir_in(parent)?;
    fs::create_dir(staging.path().join("documents"))?;
    // Verify a private copy, preventing changes to caller-owned candidate files
    // between verification and the final rename.
    for file in [
        "application.snapshot.json",
        "application.data.json",
        "definition.json",
        "provenance.json",
    ] {
        fs::copy(candidate.join(file), staging.path().join(file))?;
    }
    for d in &crate::mapping::plan(bundle, snapshot)?.documents {
        let file = format!("{}.pdf", d.id);
        fs::copy(
            candidate.join("documents").join(&file),
            staging.path().join("documents").join(file),
        )?;
    }
    // Reject extra candidate documents as well as missing ones.
    let candidate_count = fs::read_dir(candidate.join("documents"))?.count();
    ensure!(
        candidate_count == fs::read_dir(staging.path().join("documents"))?.count(),
        "document_set_mismatch"
    );
    let verified = verify_application(bundle, snapshot, assets, staging.path(), tools)?;
    source.authorize_publish(bundle, snapshot, now)?;
    write_json(&staging.path().join("validation.json"), &verified)?;
    let plan = crate::mapping::plan(bundle, snapshot)?;
    let mut artifacts = Vec::new();
    for file in [
        "application.snapshot.json",
        "application.data.json",
        "definition.json",
        "provenance.json",
        "validation.json",
    ] {
        artifacts.push(json!({"path":file,"sha256":hash_bytes(&fs::read(staging.path().join(file))?),"role":"internal_evidence"}));
    }
    for doc in &verified.documents {
        artifacts.push(json!({"path":format!("documents/{}.pdf",doc.id),"sha256":doc.sha256,"role":"submission_document"}));
    }
    write_json(
        &staging.path().join("manifest.json"),
        &json!({"schema_version":1,"state":"verified_package","trust_mode":snapshot.trust_mode,"application_id":snapshot.request.id,"snapshot_hash":snapshot.hash,"definition_hash":snapshot.definition_hash,"not_applicable":plan.not_applicable,"artifacts":artifacts,"limitations":["Fixture authorization is not identity verification.","Passing document checks is not legal filing approval."]}),
    )?;
    fs::rename(staging.path(), output)?;
    Ok(output.to_path_buf())
}
