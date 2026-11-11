# Synthetic accountant report variants

These are fictional, unsigned demonstration originals issued under the deliberately fictional name **零表單展示用會計師事務所**. They are not actual certifications. Rebuild with `python3 scripts/create-accountant-variants.py`.

- `prose-roc.pdf`: prose, comma-separated TWD amount, explicit Republic of China certification date.
- `table-units.pdf`: table, TWD amount expressed in ten-thousand units, slash-formatted dates.
- `two-page-letter.pdf`: cover includes a different printing date; company/capital/certification evidence is on page two.
- `prose-mismatch.pdf`: same prose structure, deliberately different paid-in capital.

Extraction reads the original PDF text and coordinates; it does not read this README or an answer manifest. No answer sidecars exist. Tests may assert known fixture values, but stubbed model selections test the adapter contract only, not actual model accuracy.

`demo/evidence_extract.py` supports text-bearing PDFs (first ten pages). Image-only scans return unknown without OCR. Coordinates are PDF points from the top-left, `[x,y,width,height]`. Input bytes remain unchanged; highlights must be separate UI overlays.

Live extraction/explanation requires both `ANTHROPIC_API_KEY` and explicit `ZERO_FORM_ENABLE_LLM=1`; `ZERO_FORM_SEMANTIC_MODEL` optionally selects a model. The opt-in remains off until the user authorizes a live test. No key or credential is written to fixtures, logs, or output JSON.
