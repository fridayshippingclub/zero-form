# Evidence review reference demo

For the current integrated applicant/reviewer demo, use `npm start` and the root README. This earlier isolated, English-language reference UI demonstrates a single fictional company application. It does not replace the team's frontend or perform government submission, identity verification, or legal review.

From the repository root:

```sh
python3 demo/server.py
```

Open **http://127.0.0.1:8787**. Poppler's `pdftotext` must be available on PATH, in `.tools/bin/`, or through `ZERO_FORM_PDFTOTEXT`.

The interface uses only HTML, CSS, and browser JavaScript. It calls the same-origin demo API with raw PDF uploads, renders the server's comparisons, and records reviewer decisions. It never treats a successful upload as a successful review.

## Demo sequence

1. Start with no attachments: approval is disabled; a reviewer can request documents with a note. Select **Generate demo PDFs** to invoke the native core and expose actual preview/download links.
2. Download the marked sample PDFs from the evidence panel and upload them under their matching categories.
3. With three matching documents, inspect the individual checks and record approval.
4. Replace the capital document with the mismatch sample: the prior decision clears, the difference is shown, and approval becomes unavailable.
5. Replace the name approval with the rejected sample: the review recommends decline. A reviewer must provide a reason to record it.

The service keeps one shared demo case in temporary local storage. Restarting the server resets the session. All evidence is explicitly synthetic. Source PDF links allow reviewers to inspect the underlying document.

## Frontend integration

- `GET /api/case` supplies declared facts, attachments, review findings, and any current decision.
- `POST /api/generate` with JSON `{}` invokes the native Rust core with the fixed demo fixtures. Build it first with `cargo build --workspace --locked` and make Typst and Poppler available as documented in the root README. The request can take up to 120 seconds; keep the frontend in a busy state until it resolves.
- Generation returns `{ id, status: "ready", mode: "demo_only", snapshot_hash, documents: [{ id, name, preview_url, download_url }], application }`. `GET /api/case` exposes the current result in `generation`, or `null` before success.
- `GET /api/generations/{id}` returns generation metadata; the returned preview/download URLs serve the actual generated PDFs. Prefer these URLs over constructing filenames.
- `POST /api/attachments?kind=capital_verification|address_approval|name_approval` accepts raw `application/pdf` bytes up to 10 MB.
- `GET /api/review` supplies current comparisons and the recommendation.
- `POST /api/decision` accepts `{ "decision": "approve|request_documents|decline", "reason": "...", "evidence_revision": 3 }`; use the revision from the review shown to the reviewer, not a hardcoded number.
- `GET /api/attachments/{id}` serves an uploaded PDF.

Decisions are simulated and bound to the current evidence version. A new upload clears a previous decision. The current shared review rule compares capital certification date with the separately supplied articles date, and requires articles date on or before application date. Other issue dates remain independent. These are named demo rules, not legal conclusions. This earlier fixed-fixture reference host does not populate the new articles-date fact; use the integrated Node host for the current complete happy path.

Reviewer approval also requires a successfully generated core package. Generation currently uses the fixed core fixtures; it does not implement applicant editing or identity verification. The address remains supplemental demo data and is identified as such by the API.

For a separately hosted frontend development server, reverse proxy `/api` and `/fixtures` to `http://127.0.0.1:8787` on the frontend's own origin. The local API intentionally rejects browser cross-origin writes. No framework-specific dependency is introduced here.

### Review response

`GET /api/review` returns `recommendation` (`approve`, `request_documents`, or `decline`), `evidence_revision`, `decision`, and a `checks` array. Each check has `kind`, `field`, `expected`, `actual`, `status`, and `source`. Status is one of `passed`, `missing`, `mismatch`, `needs_confirmation`, or `rejected`. A source, when available, contains an attachment ID, page number, and PDF URL. Group checks by evidence kind; the `application` kind identifies a missing core-generated package.

Uploads return the stored `attachment`, a new `evidence_revision`, and the current `review`. The decision endpoint returns the recorded decision. Errors are non-success HTTP responses with `{ "error": "..." }`; do not infer success from a completed network request. Approve can return `409` if checks are unresolved; request/decline require a nonempty reason. Generation can return `409` when busy, `503` when the core binary is unavailable, or `422` if the native pipeline fails.

Every decision checks `evidence_revision`. If another tab changes the evidence, a stale decision returns `409` with `evidence_revision_changed`. Refresh the findings and require a new reviewer action; never automatically resubmit the old decision.
