# Agent API (local demonstration)

The agent reads the same schema, semantic role bindings and signed application as the human UI. This is a single-user local demo, with simulated identity/registry checks; it is not an authenticated production review service.

```sh
curl http://localhost:5173/api/agent/schema
curl http://localhost:5173/api/agent/review
```

`GET /api/agent/schema` returns field definitions, applicant/representative/director bindings to the same person entity, expanded per-form bindings, computed input/placement/document counts, missing draft fields, and endpoint links.

`GET /api/agent/review` returns `404` until a signed snapshot exists. Its `mode` is `demo_only`. It includes the signed application ID/version/hash, current evidence revision, data/provenance, six generated PDF hashes/URLs and role bindings, uploaded PDF observations with source-page links (legacy fixed-label observations default to page one), verification checks and recommendation. Certification date references the uploaded report and declared articles date; the separate articles-before-application rule references both declared dates.

Generated documents have `source: generated` and `confidence: verified_render` when their stored native-core output digest still matches. Their bindings describe confirmed inputs; they are **not independently extracted observed text**. Uploaded attachment observations come from the PDF parser, not the fixture catalog. A recommendation of `approve` does not set a human decision: `decision` remains `null` until the officer acts in the UI.

Document URLs include `snapshotHash`; a different application or version at the same numeric URL returns `409` when the supplied hash does not match. Clients should preserve the complete returned URL. No local filesystem paths are exposed by these agent endpoints.

Agents can populate a draft through the existing endpoint after the applicant starts a session:

```sh
curl -X POST http://localhost:5173/api/agent/draft \
  -H 'Content-Type: application/json' \
  -d '{"values":{"company.capital":"10000"}}'
```

Human confirmation/signing and the officer decision remain in the existing UI; no agent approval mutation endpoint is provided. Run the isolated full happy-path smoke with `node demo/agent-review-smoke.mjs`.

## Applicant self-review before signing

`POST /api/attachments?kind=capital_verification|address_approval|name_approval`
accepts raw `application/pdf` (10 MB maximum) for a started draft. The original
bytes are retained. Unrecognized PDF content is accepted as unreviewed evidence,
not treated as a successful extraction. Completed drafts can download the same
marked sample PDFs from `GET /api/mock-attachments/:kind` before signing.

`GET /api/self-review/readiness` exposes provider/model availability, never the key.
The server adapter uses `ANTHROPIC_API_KEY` and requires the explicit
`ZERO_FORM_ENABLE_LLM=1` opt-in; `ZERO_FORM_SEMANTIC_MODEL` optionally selects the
model. Without opt-in/key, fixed-label source extraction still works and semantic
extraction/explanation is explicitly unavailable. Scanned PDFs without a text
layer remain unknown; no OCR service is connected.

`POST /api/self-review` with `{}` reads only the server-owned draft and uploaded
evidence. It returns `stage: "draft"`, `draft_hash`, `evidence_revision`, `current`,
`checks`, `extraction`, `explanation`, and a recommendation:

- `ready_to_submit`: all deterministic checks pass.
- `needs_attention`: a known mismatch, rejection, missing document or required input.
- `unknown`: evidence cannot establish the needed facts.

Extraction observations retain PDF page, quote, bounding box and original-file
SHA256. Poppler supplies text spans and coordinates from the first ten pages. The model selects those spans; this is not PDF-image vision. Deterministic rules compare company
name, capital and address, enforce certification date = articles date, and articles
date ≤ application date. These are this demonstration's agreed workflow rules,
not a claim of legal filing eligibility. Receipt of a capital report is separate
from any claim that the report explicitly says approved. The optional LLM
explanation cannot override a check or recommendation.

Every signing request requires complete application fields, all three required
external PDFs, and a current passing self-review, even if self-review has not
previously been opened. Changing facts or replacing evidence invalidates it; the
signing operation checks the bound evidence revision again. A draft review is not
a signed snapshot and does not submit to government. There is no sign-then-upload bypass. The evidence revision is checked when
confirming the code and again after rendering; only successful generation of all
six PDFs marks the application submitted. Existing signed records remain readable.

Offline HTTP smoke: `node demo/self-review-smoke.mjs` (explicitly disables live
model calls). Extraction adapter tests use injected mock transport; a configured
adapter is not evidence that a live model call has been tested.

The default semantic model is `claude-haiku-5-5`. After supplying your own key in
the server environment, explicitly opt in to live calls with
`ZERO_FORM_ENABLE_LLM=1`; the default remains off. A source-only extraction can be
reproduced with the same adapter (this command makes a paid call when opted in):

```sh
ZERO_FORM_ENABLE_LLM=1 python3 demo/evidence_extract.py \
  --input bench/review/accountant-variants/two-page-letter.pdf \
  --kind capital_verification --force-llm
```

The credential is not a CLI argument or repository file. Offline transport tests:
`python3 -m unittest discover -s demo -p test_evidence_extract.py`.

Original-file SHA256 equality establishes that uploaded bytes were not changed by extraction. It does not establish visual correctness, authenticity, or OCR accuracy. The native PDF generator separately checks protected pixels at configured resolutions; those rendering checks are not performed by the semantic extraction adapter.

For an officer-requested correction, the reopened field remains visible as UI metadata. A valid applicant answer acknowledges it; an agent draft does not. Corrected facts and evidence must pass a new self-review before a new confirmation code can be requested.

## Evidence trust boundary

PDF text is untrusted data in a JSON message, separate from the model's system
instructions. The adapter locally validates the kind-specific output schema,
rejects extra or duplicate JSON keys, and accepts values only from existing
source spans. Ambiguous labels remain unknown; capital grounding rejects partial
numeric tokens and omitted magnitude units. Known provider thinking blocks are
ignored, while tool/action blocks are rejected. No model-callable tools or
approval writes are exposed. Explanations receive only allowed rule/status values
and typed amounts/dates, excluding source quotations, names, addresses and URLs.
Deterministic application checks remain authoritative.

Fourteen offline tests cover these controls. They do not establish general
semantic correctness or live prompt-injection resilience; the earlier recorded
live extraction results are a separate test. Design references:
[Anthropic guardrail guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)
and [OWASP prompt-injection guidance](https://genai.owasp.org/llmrisk/llm01-prompt-injection/).

The synthetic name reservation record supplies read-only `company.reservation_no` (`113045678`) to both the application letter and registration form. Applicant and agent draft writes cannot replace it. Startup fills only missing draft values with matching seeded name/items provenance; existing signed snapshots remain unchanged. This is a demo record, not verification of a government reservation.
