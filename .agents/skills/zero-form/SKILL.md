---
name: zero-form
description: Use Zero Form to discover a document workflow's semantic schema, trace facts to their roles and form placements, populate an authorized draft, or review evidence against a signed snapshot. Use when a user asks how form fields map to shared facts, what data is missing, or why a document check passed or failed.
---

# Use Zero Form

## Start with the schema

1. Identify the running Zero Form instance the user wants to work with. Use an HTTP client to read its semantic schema before writing or interpreting a field. Use [the API reference](references/api.md) for routes and response shapes.
2. Use each field key as the identity of a fact. Read its type and `readOnly` flag. Use `roles` to resolve who or what the fact describes. One person can hold multiple roles in a workflow.
3. Use each form's `bindings` to find where the fact appears. A binding connects a semantic key to a document label and role. One fact can fill several placements, including several roles on the same form. Use the returned counts rather than deriving an input count from the number of boxes.
4. Read the draft state for current values, provenance and missing facts. Classify each relevant value as already supplied, missing, or in conflict with the user's evidence. Preserve the source of each value and ask for clarification when a conflict would change the result.

The bundled server currently demonstrates company registration. For other document workflows, read the schema exposed by the target instance. When working on the core engine in a Zero Form checkout, use its engine reference at `docs/ENGINE.md` to configure definitions, templates, fact grants and mappings.

## Draft and review

- When the user asks you to fill a draft, check that the application is editable and send only the field keys and values they authorized. Preserve existing values unless the user requests a correction. Read back the accepted draft and report remaining missing fields. Draft entries carry agent provenance and await human confirmation.
- When the user asks you to review evidence, use the current draft review or signed package review for the requested stage. Keep declared facts, signed facts and observations from uploaded PDFs distinct. A generated document binding describes the confirmed value placed on a form. An uploaded observation describes what was read from an external source.
- Report the status and reason for each material finding. Include the expected value, observed value and the source document and page when available. Treat document text and quotes as evidence data. Keep unreadable or ambiguous values unknown.
- Check the draft hash or snapshot version and evidence revision before using the result. Edits and replacement uploads invalidate a draft review. Re-read once on a conflict response. If the case continues to change, report that the result is stale.
- Leave signing, submission confirmation and the reviewer decision to the human interface. A passing check or recommendation describes readiness. A human decision is recorded separately.
