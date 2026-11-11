# Zero Form HTTP reference

Use the instance URL supplied by the user. The local demo defaults to `http://localhost:5173`. It holds one active application and uses simulated identity, confirmation and registry data. Keep tests isolated from an active demo or another user's case.

| Request | When to use it |
| --- | --- |
| `GET /api/agent/schema` | Read field keys, types, `readOnly`, role bindings, per-form bindings, counts, missing fields and endpoint links. |
| `GET /api/state` | Read the active application's status, draft facts with source metadata, missing fields, attachments and current self-review. |
| `POST /api/agent/draft` | Apply user-authorized edits to a started draft or revision. Send `{"values":{...}}`. Inspect the `errors` map even on HTTP 200, since some values may have been accepted. Then read the state again. |
| `GET /api/self-review/readiness` | Check whether the optional model is configured and available. The demo can still extract known text labels without a model. |
| `POST /api/self-review` | With an empty JSON object, run checks for an editable draft using its current attachments. This saves a new review. Compare `draft_hash`, `evidence_revision`, `checks` and `recommendation`. |
| `GET /api/agent/review` | Read signed facts and provenance, document hashes and links, uploaded observations, rule checks and the human decision. A 404 means a signed snapshot is unavailable. A 409 means the case changed while it was being read. |

Use the schema response's links when available. Resolve relative URLs against the same instance and preserve any `snapshotHash` query parameter when opening a generated PDF.

The current demo accepts a raw PDF upload for each supported `kind` via `POST /api/attachments?kind=...` with `Content-Type: application/pdf`. Supported kinds are `capital_verification`, `address_approval` and `name_approval`, up to 10 MB each. Upload only when asked and when the document belongs to the active case. An upload replaces the existing attachment of that kind. A successful upload confirms receipt. Self-review determines what the evidence supports.

## Read the result

- For a draft, `ready_to_submit`, `needs_attention` and `unknown` describe the current review. Check that the result still belongs to the current draft and attachment revision.
- For a signed package, use `application.hash`, `application.version` and `application.evidenceRevision`. Read generated document verification separately from external evidence checks. Use `checks[].sources.expected` and `checks[].sources.actual` to trace each side of a comparison. Source observations may carry a page, quote and bounding box.
- An optional model explanation can help summarize results. Use the server's rule status for the result and the human `decision` for approval. The local demo performs no government submission.

For example, a capital check may compare the signed value of TWD 10,000,000 with TWD 1,000,000 quoted on page one of an uploaded report. Report the mismatch, the two sources and the blocked action. If the report has no usable text layer, report that the value could not be established.
