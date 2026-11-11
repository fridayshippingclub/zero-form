use crate::{
    contracts::*,
    definition::*,
    pdf::{Tools, run_tool},
};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path, process::Command};

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentVerification {
    pub id: String,
    pub sha256: String,
    pub pages: usize,
    pub fields_checked: usize,
    pub dpis: Vec<u32>,
    pub changed_protected_pixels: u64,
}
#[derive(Deserialize)]
struct Html {
    body: Body,
}
#[derive(Deserialize)]
struct Body {
    doc: TextDoc,
}
#[derive(Deserialize)]
struct TextDoc {
    #[serde(default)]
    page: Vec<TextPage>,
}
#[derive(Deserialize)]
struct TextPage {
    #[serde(default)]
    word: Vec<Word>,
}
#[derive(Deserialize)]
struct Word {
    #[serde(rename = "@xMin")]
    x: f64,
    #[serde(rename = "@yMin")]
    y: f64,
    #[serde(rename = "@xMax")]
    right: f64,
    #[serde(rename = "@yMax")]
    bottom: f64,
    #[serde(rename = "$text")]
    text: String,
}
fn normalized(text: &str) -> String {
    text.chars().filter(|c| !c.is_whitespace()).collect()
}
fn check_text(pdf: &Path, plan: &DocumentPlan, dir: &Path, tools: &Tools) -> Result<()> {
    let bbox = dir.join("text.xhtml");
    run_tool(
        Command::new(&tools.pdftotext)
            .arg("-bbox")
            .arg(pdf)
            .arg(&bbox),
        &dir.join("text.log"),
        tools.timeout_seconds,
    )?;
    let html: Html = quick_xml::de::from_str(&fs::read_to_string(bbox)?)?;
    for write in &plan.writes {
        if matches!(write.target.control, TargetKind::Text { .. }) {
            let [x, y, w, h] = write.target.rect;
            let page = html
                .body
                .doc
                .page
                .get(write.target.page as usize - 1)
                .context("text_page_missing")?;
            let words = page
                .word
                .iter()
                .filter(|word| {
                    word.x >= x - 0.5
                        && word.y >= y - 1.
                        && word.right <= x + w + 0.5
                        && word.bottom <= y + h + 1.
                })
                .map(|word| word.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            ensure!(
                normalized(&words) == normalized(write.value.as_str().context("text_required")?),
                "text_readback_mismatch: {} / {}",
                plan.id,
                write.target_id
            );
        }
    }
    Ok(())
}
pub fn verify_document(
    template: &Template,
    plan: &DocumentPlan,
    assets: &Path,
    pdf: &Path,
    tools: &Tools,
) -> Result<DocumentVerification> {
    let source = asset_path(assets, &template.source)?;
    let input = crate::pdf::inspect_template(&source)?;
    let output = crate::pdf::inspect_template(pdf)?;
    ensure!(
        input.pages.len() == output.pages.len(),
        "page_count_changed"
    );
    for (a, b) in input.pages.iter().zip(&output.pages) {
        ensure!(
            a.width == b.width && a.height == b.height,
            "page_size_changed"
        );
    }
    let dir = tempfile::tempdir()?;
    check_text(pdf, plan, dir.path(), tools)?;
    for dpi in [144u32, 288] {
        for page in &input.pages {
            let mut images = Vec::new();
            for (name, path) in [("source", source.as_path()), ("candidate", pdf)] {
                let prefix = dir.path().join(name);
                run_tool(
                    Command::new(&tools.pdftoppm)
                        .arg("-png")
                        .arg("-r")
                        .arg(dpi.to_string())
                        .arg("-f")
                        .arg(page.number.to_string())
                        .arg("-l")
                        .arg(page.number.to_string())
                        .arg("-singlefile")
                        .arg(path)
                        .arg(&prefix),
                    &dir.path().join(format!("{name}.log")),
                    tools.timeout_seconds,
                )?;
                images.push(image::open(prefix.with_extension("png"))?.into_rgb8());
            }
            let a = &images[0];
            let b = &images[1];
            ensure!(a.dimensions() == b.dimensions(), "raster_size_changed");
            let (width, height) = a.dimensions();
            ensure!(
                u64::from(width) * u64::from(height) <= 40_000_000,
                "raster_too_large"
            );
            let mut allowed = vec![false; (width * height) as usize];
            let scale = f64::from(dpi) / 72.;
            for write in plan.writes.iter().filter(|w| w.target.page == page.number) {
                let [x, y, w, h] = write.target.rect;
                let x0 = (x * scale).floor().max(0.) as u32;
                let y0 = (y * scale).floor().max(0.) as u32;
                let x1 = ((x + w) * scale).ceil().min(f64::from(width)) as u32;
                let y1 = ((y + h) * scale).ceil().min(f64::from(height)) as u32;
                ensure!(x1 > x0 && y1 > y0, "empty_target_region");
                let selected = write.value.as_bool() != Some(false);
                let mut ink = 0u64;
                for yy in y0..y1 {
                    for xx in x0..x1 {
                        let old = a.get_pixel(xx, yy).0;
                        let new = b.get_pixel(xx, yy).0;
                        ensure!(
                            old.iter().all(|v| *v >= 245),
                            "target_not_blank: {}",
                            write.target_id
                        );
                        if selected {
                            allowed[(yy * width + xx) as usize] = true;
                        }
                        if new.iter().any(|v| *v < 200) {
                            ink += 1;
                        }
                        if matches!(write.target.control, TargetKind::Checkbox) && selected {
                            let px = (f64::from(xx) + 0.5) / scale;
                            let py = (f64::from(yy) + 0.5) / scale;
                            let inside = px > x + 2.5
                                && px < x + w - 2.5
                                && py > y + 2.5
                                && py < y + h - 2.5;
                            if inside {
                                ensure!(new.iter().all(|v| *v < 30), "checkbox_mark_missing");
                            }
                            let outside = px < x + 1.5
                                || px > x + w - 1.5
                                || py < y + 1.5
                                || py > y + h - 1.5;
                            if outside {
                                ensure!(new == old, "checkbox_shape_invalid");
                            }
                        }
                    }
                }
                if selected {
                    ensure!(ink > 0, "empty_output_field: {}", write.target_id);
                } else {
                    ensure!(ink == 0, "unchecked_option_changed");
                }
            }
            let changed = a
                .pixels()
                .zip(b.pixels())
                .zip(allowed)
                .filter(|((a, b), allowed)| !*allowed && a != b)
                .count();
            ensure!(
                changed == 0,
                "protected_pixels_changed: {} page {} at {} DPI: {}",
                plan.id,
                page.number,
                dpi,
                changed
            );
        }
    }
    Ok(DocumentVerification {
        id: plan.id.clone(),
        sha256: hash_bytes(&fs::read(pdf)?),
        pages: input.pages.len(),
        fields_checked: plan.writes.len(),
        dpis: vec![144, 288],
        changed_protected_pixels: 0,
    })
}
