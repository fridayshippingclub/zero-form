//! Extracted from the AXD prototype's Form XObject compositor.
//! This static-only adapter preserves the source catalog and annotations; the
//! caller rejects unsupported forms before composition. Resources stay isolated.
use anyhow::{Context, Result, ensure};
use lopdf::{Document, Object, ObjectId, Stream, dictionary};
use std::{collections::BTreeMap, path::Path};

pub(crate) fn inherited(doc: &Document, mut id: ObjectId, key: &[u8]) -> Result<Object> {
    for _ in 0..32 {
        let dict = doc.get_dictionary(id)?;
        if let Ok(value) = dict.get_deref(key, doc) {
            return Ok(value.clone());
        }
        id = dict.get(b"Parent")?.as_reference()?;
    }
    anyhow::bail!("page_inheritance_too_deep")
}

fn overlay_forms(
    overlay: &Path,
    first_id: u32,
    page_count: usize,
) -> Result<(Document, BTreeMap<u32, Stream>)> {
    let mut o = Document::load(overlay)?;
    ensure!(
        o.get_pages().len() == page_count,
        "overlay page count mismatch"
    );
    o.renumber_objects_with(first_id);
    let overlays = o.get_pages();
    let mut forms = BTreeMap::new();
    for (n, p) in &overlays {
        let page = o.get_dictionary(*p)?;
        let resources = page.get_deref(b"Resources", &o)?.clone();
        let data = o.get_page_content(*p);
        let bbox = page.get(b"MediaBox")?.clone();
        forms.insert(*n,Stream::new(dictionary!{"Type"=>"XObject","Subtype"=>"Form","FormType"=>1,"BBox"=>bbox,"Resources"=>resources},data));
    }
    Ok((o, forms))
}

pub(crate) fn compose(source: &Path, overlay: &Path, output: &Path) -> Result<()> {
    let mut d = Document::load(source)?;
    let originals = d.get_pages();
    let (o, mut forms) = overlay_forms(overlay, d.max_id + 1, originals.len())?;
    d.max_id = o.max_id;
    d.objects.extend(o.objects);
    for (n, p) in originals {
        let form = d.add_object(forms.remove(&n).context("missing overlay")?);
        let mut resources = inherited(&d, p, b"Resources")?.as_dict()?.clone();
        let mut xobjs = resources
            .get_deref(b"XObject", &d)
            .ok()
            .map(|v| v.as_dict().cloned())
            .transpose()?
            .unwrap_or_default();
        let mut name = "ZeroFormOverlay".to_string();
        while xobjs.has(name.as_bytes()) {
            name.push('_');
        }
        xobjs.set(name.as_bytes(), form);
        resources.set("XObject", xobjs);
        let original_streams = d.get_page_contents(p);
        let prefix = d.add_object(Stream::new(dictionary! {}, b"q\n".to_vec()));
        let suffix = d.add_object(Stream::new(
            dictionary! {},
            format!("\nQ\nq\n/{name} Do\nQ\n").into_bytes(),
        ));
        let mut streams = vec![Object::Reference(prefix)];
        streams.extend(original_streams.into_iter().map(Object::Reference));
        streams.push(Object::Reference(suffix));
        let page = d.get_object_mut(p)?.as_dict_mut()?;
        page.set("Resources", resources);
        page.set("Contents", streams);
    }
    d.save(output)?;
    Ok(())
}
