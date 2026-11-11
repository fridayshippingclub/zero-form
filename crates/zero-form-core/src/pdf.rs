use crate::{contracts::*, definition::*};
use anyhow::{Context, Result, ensure};
use lopdf::{Document, Object};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};
use wait_timeout::ChildExt;

#[derive(Clone, Debug)]
pub struct Tools {
    pub typst: PathBuf,
    pub pdftoppm: PathBuf,
    pub pdftotext: PathBuf,
    pub timeout_seconds: u64,
}
impl Default for Tools {
    fn default() -> Self {
        Self {
            typst: std::env::var_os("ZERO_FORM_TYPST")
                .unwrap_or_else(|| "typst".into())
                .into(),
            pdftoppm: std::env::var_os("ZERO_FORM_PDFTOPPM")
                .unwrap_or_else(|| "pdftoppm".into())
                .into(),
            pdftotext: std::env::var_os("ZERO_FORM_PDFTOTEXT")
                .unwrap_or_else(|| "pdftotext".into())
                .into(),
            timeout_seconds: 60,
        }
    }
}
pub fn run_tool(command: &mut Command, log: &Path, timeout: u64) -> Result<()> {
    let output = fs::File::create(log)?;
    let mut child = command
        .stdout(Stdio::from(output.try_clone()?))
        .stderr(Stdio::from(output))
        .stdin(Stdio::null())
        .spawn()
        .context("tool_unavailable")?;
    let result = child.wait_timeout(Duration::from_secs(timeout.clamp(1, 120)))?;
    match result {
        Some(status) => ensure!(status.success(), "tool_failed: see {}", log.display()),
        None => {
            let _ = child.kill();
            let _ = child.wait();
            anyhow::bail!("tool_timeout");
        }
    }
    Ok(())
}
pub fn doctor(tools: &Tools) -> Result<serde_json::Value> {
    let dir = tempfile::tempdir()?;
    let mut versions = serde_json::Map::new();
    for (name, path, arg) in [
        ("typst", &tools.typst, "--version"),
        ("pdftoppm", &tools.pdftoppm, "-v"),
        ("pdftotext", &tools.pdftotext, "-v"),
    ] {
        let log = dir.path().join(format!("{name}.log"));
        run_tool(Command::new(path).arg(arg), &log, 10)?;
        let text = fs::read_to_string(log)?;
        let line = text.lines().next().unwrap_or_default();
        if name == "typst" {
            ensure!(
                line.starts_with("typst 0.15.1 "),
                "unsupported_typst_version: expected 0.15.1"
            );
        }
        versions.insert(name.into(), line.into());
    }
    Ok(versions.into())
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page {
    pub number: u32,
    pub width: f64,
    pub height: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Inspection {
    pub sha256: String,
    pub pages: Vec<Page>,
    pub capabilities: Vec<String>,
}
fn number(v: &Object) -> Result<f64> {
    Ok(v.as_float()? as f64)
}
pub fn inspect_template(path: &Path) -> Result<Inspection> {
    ensure!(
        fs::metadata(path)?.len() <= 32 * 1024 * 1024,
        "pdf_too_large"
    );
    let bytes = fs::read(path)?;
    let doc = Document::load_mem(&bytes)?;
    ensure!(!doc.trailer.has(b"Encrypt"), "encrypted_pdf_unsupported");
    let root = doc.trailer.get(b"Root")?.as_reference()?;
    let catalog = doc.get_dictionary(root)?;
    ensure!(
        !catalog.has(b"AcroForm")
            && !catalog.has(b"Perms")
            && !catalog.has(b"OpenAction")
            && !catalog.has(b"AA"),
        "active_or_signed_pdf_unsupported"
    );
    for object in doc.objects.values() {
        if let Ok(dict) = object.as_dict() {
            ensure!(
                !dict.has(b"ByteRange")
                    && dict.get(b"FT").and_then(Object::as_name).ok() != Some(b"Sig"),
                "signed_pdf_unsupported"
            );
        }
    }
    let pages = doc.get_pages();
    ensure!(!pages.is_empty() && pages.len() <= 16, "pdf_page_limit");
    let mut result = Vec::new();
    for (number, id) in pages {
        let page = doc.get_dictionary(id)?;
        ensure!(
            !page.has(b"Annots") && !page.has(b"AA") && !page.has(b"UserUnit"),
            "page_features_unsupported"
        );
        if let Ok(rotation) = crate::composition::inherited(&doc, id, b"Rotate") {
            ensure!(rotation.as_i64()? == 0, "rotated_pdf_unsupported");
        }
        let media = crate::composition::inherited(&doc, id, b"MediaBox")?;
        let b = media.as_array()?;
        ensure!(b.len() == 4, "invalid_page_box");
        let coords = b.iter().map(self::number).collect::<Result<Vec<_>>>()?;
        ensure!(
            coords[0] == 0.
                && coords[1] == 0.
                && coords[2] > 0.
                && coords[3] > 0.
                && coords[2] <= 1500.
                && coords[3] <= 1500.,
            "unsupported_page_box"
        );
        if let Ok(crop) = crate::composition::inherited(&doc, id, b"CropBox") {
            ensure!(
                crop.as_array()?
                    .iter()
                    .map(self::number)
                    .collect::<Result<Vec<_>>>()?
                    == coords,
                "crop_box_unsupported"
            );
        }
        result.push(Page {
            number,
            width: coords[2],
            height: coords[3],
        });
    }
    Ok(Inspection {
        sha256: hash_bytes(&bytes),
        pages: result,
        capabilities: vec!["static_text_fill".into(), "checkbox_fill".into()],
    })
}
pub fn render_document(
    template: &Template,
    plan: &DocumentPlan,
    assets: &Path,
    out: &Path,
    tools: &Tools,
) -> Result<()> {
    let source = asset_path(assets, &template.source)?;
    let font = asset_path(assets, &template.font.asset)?;
    let inspection = inspect_template(&source)?;
    fs::create_dir_all(out)?;
    let font_bytes = fs::read(&font)?;
    let face =
        ttf_parser::Face::parse(&font_bytes, 0).map_err(|_| anyhow::anyhow!("invalid_font"))?;
    let family_matches = face
        .names()
        .into_iter()
        .filter(|n| {
            n.name_id == ttf_parser::name_id::FAMILY
                || n.name_id == ttf_parser::name_id::TYPOGRAPHIC_FAMILY
        })
        .filter_map(|n| n.to_string())
        .any(|name| name == template.font.family);
    ensure!(
        family_matches && !face.is_bold() && !face.is_italic(),
        "font_identity_mismatch"
    );
    let font_dir = out.join("fonts");
    fs::create_dir(&font_dir)?;
    fs::copy(&font, font_dir.join("input.ttf"))?;
    // Extracted baseline-only placement policy from AXD; explicit metrics avoid
    // differences between Typst's paragraph ascent and a fixed form's field box.
    let mut typ = String::from(
        "#set text(top-edge: \"baseline\", bottom-edge: \"baseline\", fallback: false, kerning: false, ligatures: false, overhang: false)\n#set smartquote(enabled: false)\n",
    );
    for (i, p) in inspection.pages.iter().enumerate() {
        if i > 0 {
            typ.push_str("#pagebreak()\n");
        }
        typ.push_str(&format!(
            "#set page(width: {}pt, height: {}pt, margin: 0pt, fill: none)\n",
            p.width, p.height
        ));
        for write in plan.writes.iter().filter(|w| w.target.page == p.number) {
            ensure!(
                write.target.filled_by == FilledBy::Applicant,
                "protected_target"
            );
            let [x, y, w, h] = write.target.rect;
            ensure!(x + w <= p.width && y + h <= p.height, "target_outside_page");
            match write.target.control {
                TargetKind::Text { size } => {
                    let value = write.value.as_str().context("text_required")?;
                    let scale = size / f64::from(face.units_per_em());
                    let mut width = 0.;
                    let mut left = 0f64;
                    let mut right = 0f64;
                    let mut top = 0f64;
                    let mut bottom = 0f64;
                    for c in value.chars() {
                        let glyph = face.glyph_index(c).context("missing_glyph")?;
                        if let Some(bb) = face.glyph_bounding_box(glyph) {
                            top = top.max(f64::from(bb.y_max) * scale);
                            bottom = bottom.min(f64::from(bb.y_min) * scale);
                            left = left.min(width + f64::from(bb.x_min) * scale);
                            right = right.max(width + f64::from(bb.x_max) * scale);
                        }
                        width += f64::from(
                            face.glyph_hor_advance(glyph)
                                .context("missing_glyph_metrics")?,
                        ) * scale;
                    }
                    ensure!(
                        right.max(width) - left <= w - 2. && top - bottom <= h - 2.,
                        "text_overflow: {}",
                        write.target_id
                    );
                    let baseline = y + (h - (top - bottom)) / 2. + top;
                    typ.push_str(&format!("#place(top + left, dx: {}pt, dy: {}pt, text(font: {}, size: {}pt, fill: black, {}))\n",x+1.-left,baseline,serde_json::to_string(&template.font.family)?,size,serde_json::to_string(value)?));
                }
                TargetKind::Checkbox => {
                    ensure!(
                        w >= 6. && h >= 6. && w <= 30. && h <= 30.,
                        "invalid_checkbox_geometry"
                    );
                    if write.value.as_bool().context("boolean_required")? {
                        // A filled square is a deliberate, deterministic mark style.
                        typ.push_str(&format!("#place(top + left, dx: {}pt, dy: {}pt, rect(width: {}pt, height: {}pt, fill: black, stroke: none))\n",x+2.,y+2.,w-4.,h-4.));
                    }
                }
            }
        }
        typ.push_str("#box(width: 0pt, height: 0pt)\n");
    }
    ensure!(
        plan.writes
            .iter()
            .all(|w| inspection.pages.iter().any(|p| p.number == w.target.page)),
        "target_page_missing"
    );
    fs::write(out.join("overlay.typ"), typ)?;
    let out = out.canonicalize()?;
    run_tool(
        Command::new(&tools.typst)
            .arg("compile")
            .arg("--root")
            .arg(&out)
            .arg("--font-path")
            .arg(out.join("fonts"))
            .arg("--ignore-system-fonts")
            .arg("--creation-timestamp")
            .arg("0")
            .arg(out.join("overlay.typ"))
            .arg(out.join("overlay.pdf")),
        &out.join("typst.log"),
        tools.timeout_seconds,
    )?;
    crate::composition::compose(
        &source,
        &out.join("overlay.pdf"),
        &out.join("candidate.pdf"),
    )?;
    Ok(())
}
