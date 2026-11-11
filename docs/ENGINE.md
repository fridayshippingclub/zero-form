> Engine reference for the Rust core (`crates/zero-form-core`, `crates/zero-form-cli`), moved verbatim from the original README. Commands run from the repository root. Back to the [project README](../README.md).

# AXD — Zero Form Semantic Core

Compile authorized semantic facts into a frozen application snapshot and a verified multi-document PDF package. This repository includes the Rust core and the team’s applicant/reviewer web demo. The local Node server invokes native Rust/Typst/Poppler to generate verified PDFs from the confirmed applicant snapshot.

## Run the integrated hackathon demo

Requirements: Node.js, Python 3 with ReportLab, pypdf and fonttools (`python3 -m pip install reportlab pypdf fonttools`), and the native Rust/Typst/Poppler requirements below.

```sh
npm ci
cargo build --workspace --locked
npm start
```

Open `http://localhost:5173/` for the applicant and `http://localhost:5173/officer.html` for the reviewer. `DATA_DIR` selects local demo storage; use a fresh directory for a clean demonstration. SMS, registry lookups and submission are simulated. Signing invokes the native core and can take around a minute; wait for generation before opening document links.

The one-person case preserves applicant, representative and director as distinct roles bound to one person. It collects three new answers and reuses the other facts. Each form occurrence has its own role-aware mapping. Six generated PDFs are served by the existing document links. The applicant can download matching demonstration evidence and upload it; the reviewer sees the extracted evidence, comparisons and source PDFs before deciding.

New application documents use **TW-Kai (全字庫正楷體)** from the Ministry of Digital Affairs CNS11643 dataset under **SIL Open Font License 1.1**. The pinned font, source, digest and license are in `assets/fonts/tw-kai/`; no system-font installation is required. Native rendering uses a derived `Zero Form Kai Demo` glyph subset to stay within the core asset-size limit; the unchanged original font and OFL license are retained. Legacy assets retain their separately licensed fonts.

The named demo date rule is `audit.certified_on == company.articles_date` and `company.articles_date <= app.date` (same-day application allowed). The articles date is a separate prefilled signed fact. Issue dates on other attachments remain independent. The capital report parser reads its visible Chinese labels from uploaded PDF bytes; the semantic sidecar is documentation, not trusted upload evidence. These are demonstration rules, not a legal eligibility determination.

```sh
node demo/integration.mjs
```

This happy-path check starts an isolated local server, confirms applicant data, generates actual PDFs, uploads three matching demonstration proofs and records reviewer approval. It requires the dependencies above. The older English reference interface under `demo/web` is separate from the team’s integrated flow.

## Run the standalone core fixture demo

Requirements: Rust 1.97.1 (selected by `rust-toolchain.toml`), [Typst 0.15.1](https://github.com/typst/typst/releases/tag/v0.15.1), and Poppler's `pdftoppm` / `pdftotext`. Poppler 26.05.0 is the tested baseline; exact runtime versions are recorded in each validation report. Python/ReportLab creates the integrated demo’s synthetic templates and evidence; the standalone core CLI itself does not require Python.

Put these executables on PATH, place them in the ignored `.tools/bin/` directory, or set `ZERO_FORM_TYPST`, `ZERO_FORM_PDFTOPPM`, and `ZERO_FORM_PDFTOTEXT` to executable paths.

```sh
./scripts/demo.sh
# A subsequent run needs a new output destination:
./scripts/demo.sh output/demo-next
```

The default output is `output/hackathon/`. Existing outputs are never overwritten. The demo date is deliberately fixed at `2026-11-11`; fixture grants expire on `2026-12-31`. This is fixture replay, not a live identity check.

The demo creates five PDFs / six pages:

1. Synthetic application overview, including separate representative and contact names.
2. An original public Taiwan company application form with three fields populated.
3. A conditional synthetic certificate request, with an uppercase company-name projection.
4. A synthetic North Office branch attachment.
5. A synthetic South Office branch attachment.

All entered data is fictional. The official form is only partially populated; this is **not a filing-ready government application**. Sources, asset hashes and font licensing are under `assets/`.

## Frontend integration contract

The integrated `server.js` host invokes the native CLI through `scripts/render-application.py`. The CLI contract below also remains available independently. Real authentication, MFA and government submission remain outside this demonstration.

For a local build:

```sh
cargo build --workspace --locked
./target/debug/zero-form --help
./target/debug/zero-form schema > input-schemas.json
```

`schema` emits a JSON object with `definition`, `request`, and `fixture_facts` schemas generated directly from Rust types. Each is a complete schema with its own `$defs`; extract the desired property before validating an input. These describe input shape. Runtime definition checks and application rules still apply. Output types are owned by `crates/zero-form-core/src/contracts.rs` and `package.rs`, with concrete examples produced by the demo.

| Input | Example / responsibility |
| --- | --- |
| Application definition | `bench/demo/definition.json`: version, effective dates, closed semantic schema, role/predicate selectors, rules, document mappings and hash-pinned physical templates |
| Application request | `bench/demo/request.json`: ID, application type, scope, effective date, and role-to-entity IDs |
| Authorized fixture data | `bench/demo/facts.json`: one read revision, grant, allowed IDs, approved definition hash, versioned facts and representative relationship |
| Independent expected answers | `bench/demo/expected.json`: expected document IDs and fictional identities |
| Asset root | Repository root (`--assets .`); template/font paths resolve inside it and must match registered hashes |

Semantic keys such as `company.name` are literal keys in a flat JSON object, not nested paths. They resolve through the definition's explicit role and predicate; the representative and contact can be different people. Fact values are checked against `application.schema`. Templates use points, top-left origin, `[x, y, width, height]` rectangles.

### Prepare and handle missing data

```sh
mkdir -p output
./target/debug/zero-form prepare \
  --definition bench/demo/definition.json \
  --request bench/demo/request.json \
  --fixture-facts bench/demo/facts.json \
  --now 2026-11-11 --out output/prepared.snapshot.json
```

Success exits `0`, writes the snapshot, and emits `{ "status": "prepared", "snapshot_hash": "...", "path": "...", "trust_mode": "fixture_only" }` on stdout.

If more data is needed, `prepare` still saves the diagnostic snapshot and exits `1`. Stdout contains a `Preparation` object:

```json
{
  "snapshot": { "fields": { "contact.email": { "state": "missing" } } },
  "issues": [
    {
      "code": "schema_validation",
      "location": "/contact.email",
      "message": "Application data does not satisfy its registered schema."
    }
  ]
}
```

This is an abbreviated example; the actual snapshot also contains request, hashes, selected facts, relationships and read/grant evidence. States are `known` (with `fact`), `missing`, `unknown`, `conflict` (with fact IDs), and `not_applicable`. JSON Schema issue locations are JSON Pointers; relationship/business-rule locations are rule IDs, conflict locations are semantic keys, and mapping issues identify `documents` with a specific reason. Unknown conditions block affected documents. An unchecked boolean is explicitly `false`.

On this missing-data result, stderr contains an error with code `application_needs_data`. Do not render or publish until issues are resolved and a **new** snapshot is prepared. Snapshot files are never overwritten. A frontend should display the field/rule issue and request a host-authorized correction, not edit snapshot JSON or its hash.

### Render, verify and publish separately

```sh
./target/debug/zero-form render \
  --definition bench/demo/definition.json --snapshot output/prepared.snapshot.json \
  --assets . --candidate output/candidate

./target/debug/zero-form verify \
  --definition bench/demo/definition.json --snapshot output/prepared.snapshot.json \
  --assets . --candidate output/candidate

./target/debug/zero-form publish \
  --definition bench/demo/definition.json --snapshot output/prepared.snapshot.json \
  --fixture-facts bench/demo/facts.json --now 2026-11-11 \
  --assets . --candidate output/candidate --out output/published
```

Use the executable paths/environment above when invoking these directly. `render` creates an unverified candidate suitable for inspection. `verify` returns a report on stdout. `publish` reauthorizes, copies to private staging, verifies that exact copy and atomically exposes the complete output; it does not trust a previous report. Published PDFs retain the candidate bytes. `run` combines prepare/render/publish using the same library functions; `scripts/demo.sh` shows the complete invocation.

Other commands: `doctor` checks tools, `inspect <pdf>` reports supported static page geometry, and `check-definition <json>` validates a definition and prints its canonical hash. Hashing uses recursively sorted JSON object keys; the serialized Rust contract includes its defaults. Use the engine-generated hash when approving a fixture definition.

### Read a successful package

| Path | Consumer meaning |
| --- | --- |
| `manifest.json` | `state: verified_package`, application ID, trust mode, snapshot/definition hashes, omitted document IDs, artifacts with SHA-256 and `submission_document` / `internal_evidence` role |
| `application.data.json` | Flat resolved semantic values for a host or future API adapter |
| `application.snapshot.json` | Immutable request, roles, selected facts/relationships, revisions, provenance and grant/read references |
| `provenance.json` | Planned documents and writes; each write has source field/fact/revision, source reference, transform, physical target and displayed value |
| `definition.json` | The exact registered definition used for this application |
| `validation.json` | Passed PDF checks, tool versions, document hashes, page/field counts, DPIs and protected-pixel changes |
| `documents/*.pdf` | The only artifacts marked as submission documents; suitable for host-served preview/download |

The frontend should use manifest artifact roles, not assume every file is a submission document. Internal evidence can contain personal data; a production host must apply authorization when serving it. A manifest/hash proves neither identity nor legal eligibility.

Command failures return exit `1` and one JSON object on stderr:

```json
{"status":"error","code":"output_already_exists","message":"output_already_exists"}
```

Most failures have no stdout. `prepare` / `run` needing data also emit the diagnostic `Preparation` on stdout. Argument/usage errors come from Clap and exit `2`; they are not engine JSON errors. Success JSON varies by command as described above. Keep stdout and stderr separate, and treat `message` as diagnostic text; not every dependency-originated `code` is a stable enum yet.

## Core ownership and old-core extraction

`contracts` defines types; `definition` validates bundles and pinned assets; `facts` resolves roles and snapshots; `mapping` owns semantic rules, transforms and document composition; `pdf` / `composition` handle native rendering; `verification` independently reads PDFs; `package` owns staging and publication. The CLI calls these modules without a separate rule implementation.

`composition.rs` adapts the old AXD prototype's `src/forms.rs` Form XObject compositor. Font placement also reuses its baseline-placement approach. The new implementation isolates resources, preserves source catalogs/content, and rejects unsupported forms instead of stripping their structures. It has no runtime dependency on the old repository. The new contracts, semantic rules, authorization boundary and tests live here.

A production host implements `FactSource::read` and `FactSource::authorize_publish`. They must enforce authenticated scope, approved definitions, a consistent read and current permission to use the complete snapshot. Read access, representative authority and identity-update events are separate concepts. The fixture adapter authenticates its complete current read version; it intentionally rejects publication of an older snapshot after the fixture version changes. Production history/retained revisions require a host adapter.

## Verification and remaining work

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
./scripts/test-pdf.sh
```

The external PDF tests are explicitly ignored by the ordinary test command, so run the last command when checking the complete pipeline. All tests use isolated temporary directories and fictional data. Rebuilding synthetic input PDFs is optional: `python3 scripts/create-demo.py` requires ReportLab and invokes the CLI to recalculate the definition approval hash.

Verified milestone evidence: five documents / six pages, exact role/value readback, conditional and repeated mapping, selected/unselected checkboxes, font coverage/fit, zero changed protected pixels at 144 and 288 DPI, and visual inspection of all demo pages. Tests also cover missing/revoked data, representative authority, conflicts, unknown conditions, snapshot forgery, exact integer sums, template drift, overflow, PDF tampering and failed publication leaving no output.

**The local integrated host is implemented.** It confirms the demo snapshot, generates native PDFs and exposes uploaded-evidence review. It remains a local PoC with simulated identity and registries. For actual filings, a separate milestone must register complete reviewed mappings/rules for a selected application type; the demo's three populated official fields do not constitute that coverage.

Current limits: static, unrotated PDFs with blank targets; one pinned regular font per template; explicit single-line text and square boolean marks; repeated whole documents only. No AcroForm/XFA, encrypted/signed files, annotations, placeholder replacement, OCR, handwritten signatures, table-row expansion, profile writeback, MFA provider or government API. There is no global application registry: overwrite/locking is per output path. Pixel/text checks cover the documented assertions; they are not a hostile-PDF security sandbox, legal approval or cryptographic attestation. Tested locally on Apple Silicon; other platforms need their external-tool tests run.
