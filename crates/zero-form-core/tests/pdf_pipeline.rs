use serde_json::{Value, json};
use std::{fs, path::PathBuf};
use zero_form_core::{
    contracts::*, definition::*, facts::FixtureSource, mapping::plan, package::*, pdf::*,
    prepare_application, verification::verify_document,
};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn fixture() -> (DefinitionBundle, Snapshot, FixtureSource) {
    let root = root();
    let bundle = read_json(&root.join("bench/demo/definition.json")).unwrap();
    let source = FixtureSource(read_json(&root.join("bench/demo/facts.json")).unwrap());
    let prepared = prepare_application(
        &bundle,
        read_json(&root.join("bench/demo/request.json")).unwrap(),
        &source,
        "2026-11-11",
    )
    .unwrap();
    assert!(prepared.issues.is_empty());
    (bundle, prepared.snapshot, source)
}

#[test]
fn assets_are_pinned_and_only_supported_static_pdfs_are_accepted() {
    let (bundle, _, _) = fixture();
    let mut asset = bundle.templates["official"].source.clone();
    let path = asset_path(&root(), &asset).unwrap();
    assert_eq!(inspect_template(&path).unwrap().pages.len(), 2);
    asset.sha256 = "0".repeat(64);
    assert!(
        asset_path(&root(), &asset)
            .unwrap_err()
            .to_string()
            .contains("asset_hash_mismatch")
    );
    asset.path = "../outside.pdf".into();
    assert!(
        asset_path(&root(), &asset)
            .unwrap_err()
            .to_string()
            .contains("unsafe_asset_path")
    );
    let temp = tempfile::tempdir().unwrap();
    let mut doc = lopdf::Document::load(path).unwrap();
    let catalog = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
    doc.get_object_mut(catalog)
        .unwrap()
        .as_dict_mut()
        .unwrap()
        .set("AcroForm", lopdf::Dictionary::new());
    let unsupported = temp.path().join("interactive.pdf");
    doc.save(&unsupported).unwrap();
    assert!(
        inspect_template(&unsupported)
            .unwrap_err()
            .to_string()
            .contains("active_or_signed_pdf_unsupported")
    );
}

#[test]
fn overflow_is_rejected_before_invoking_typst() {
    let (bundle, snapshot, _) = fixture();
    let mut document = plan(&bundle, &snapshot).unwrap().documents.remove(0);
    document
        .writes
        .iter_mut()
        .find(|w| w.target_id == "company")
        .unwrap()
        .value = json!("W".repeat(200));
    let temp = tempfile::tempdir().unwrap();
    let tools = Tools {
        typst: "nonexistent-typst-must-not-be-invoked".into(),
        ..Tools::default()
    };
    assert!(
        render_document(
            &bundle.templates["cover"],
            &document,
            &root(),
            &temp.path().join("job"),
            &tools
        )
        .unwrap_err()
        .to_string()
        .contains("text_overflow")
    );
}

#[test]
#[ignore = "requires Typst 0.15.1 and Poppler; run scripts/test-pdf.sh"]
fn five_pdfs_publish_atomically_and_tampering_is_blocked() {
    let (bundle, snapshot, source) = fixture();
    let assets = root();
    let tools = Tools::default();
    doctor(&tools).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let candidate = dir.path().join("candidate");
    let output = dir.path().join("published");
    render_application(&bundle, &snapshot, &assets, &candidate, &tools).unwrap();
    let publish = |destination: &std::path::Path, source: &FixtureSource| {
        publish_application(
            &bundle,
            &snapshot,
            PublicationPaths {
                assets: &assets,
                candidate: &candidate,
                output: destination,
            },
            source,
            "2026-11-11",
            &tools,
        )
    };
    let mut revoked = FixtureSource(source.0.clone());
    revoked.0.allowed_fact_ids.clear();
    assert!(publish(&output, &revoked).is_err());
    assert!(!output.exists());
    publish(&output, &source).unwrap();
    let report: Verification = read_json(&output.join("validation.json")).unwrap();
    assert_eq!(report.status, "passed");
    assert_eq!(report.documents.len(), 5);
    assert_eq!(report.documents.iter().map(|d| d.pages).sum::<usize>(), 6);
    assert!(
        report
            .documents
            .iter()
            .all(|d| d.changed_protected_pixels == 0 && d.dpis == [144, 288])
    );
    assert!(
        publish(&output, &source)
            .unwrap_err()
            .to_string()
            .contains("output_already_exists")
    );
    let manifest: Value = read_json(&output.join("manifest.json")).unwrap();
    for entry in manifest["artifacts"].as_array().unwrap() {
        let path = entry["path"].as_str().unwrap();
        assert_eq!(
            hash_bytes(&fs::read(output.join(path)).unwrap()),
            entry["sha256"]
        );
        if path.ends_with(".pdf") {
            assert_eq!(
                fs::read(output.join(path)).unwrap(),
                fs::read(candidate.join(path)).unwrap()
            );
        }
    }
    let extra = candidate.join("documents/extra.pdf");
    fs::write(&extra, b"unregistered").unwrap();
    assert!(
        verify_application(&bundle, &snapshot, &assets, &candidate, &tools)
            .unwrap_err()
            .to_string()
            .contains("document_set_mismatch")
    );
    fs::remove_file(extra).unwrap();
    let document = &plan(&bundle, &snapshot).unwrap().documents[0];
    let pdf = candidate.join("documents/01-overview.pdf");
    let mut altered = lopdf::Document::load(&pdf).unwrap();
    let page = altered.get_pages()[&1];
    altered
        .add_page_contents(page, b"q 0 0 0 rg 50 50 8 8 re f Q\n".to_vec())
        .unwrap();
    altered.save(&pdf).unwrap();
    let failure = publish(&dir.path().join("tampered"), &source).unwrap_err();
    assert!(
        failure.to_string().contains("protected_pixels_changed"),
        "{failure:#}"
    );
    assert!(!dir.path().join("tampered").exists());
    fs::copy(assets.join("assets/templates/application-cover.pdf"), &pdf).unwrap();
    assert!(
        verify_document(&bundle.templates["cover"], document, &assets, &pdf, &tools)
            .unwrap_err()
            .to_string()
            .contains("text_readback_mismatch")
    );
}

#[test]
#[ignore = "requires Typst 0.15.1 and Poppler; run scripts/test-pdf.sh"]
fn explicitly_unchecked_option_remains_blank_in_the_pdf() {
    let (bundle, snapshot, mut source) = fixture();
    source
        .0
        .facts
        .iter_mut()
        .find(|f| f.predicate == "include_certificate")
        .unwrap()
        .value = json!(false);
    let snapshot = prepare_application(&bundle, snapshot.request, &source, "2026-11-11")
        .unwrap()
        .snapshot;
    let document = &plan(&bundle, &snapshot).unwrap().documents[0];
    let dir = tempfile::tempdir().unwrap();
    let tools = Tools::default();
    render_document(
        &bundle.templates["cover"],
        document,
        &root(),
        dir.path(),
        &tools,
    )
    .unwrap();
    verify_document(
        &bundle.templates["cover"],
        document,
        &root(),
        &dir.path().join("candidate.pdf"),
        &tools,
    )
    .unwrap();
}
