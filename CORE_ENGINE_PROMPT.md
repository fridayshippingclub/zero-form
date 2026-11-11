# Zero Form: implement the semantic core

Work in the `fridayshippingclub/zero-form` repository. Build the first executable hackathon iteration of the AXD Semantic Engine in English. Deliver working Rust code, a native CLI, isolated tests, and a reproducible application package. This is an implementation task, not a documentation project.

The repository started empty. Useful components may be extracted from the older AXD Rust prototype when available, particularly its PDF compositor and font-placement work. Bring over only understood, necessary code, adapt it to the new contracts, preserve attribution, and test it here. No runtime dependency on the old checkout or old generated artifacts is allowed. Old success reports are not verification evidence for this repository.

## Scope and ownership

Implement this flow:

```text
Host-authorized facts and relationships
    -> application definition + explicit entity/role bindings
    -> one immutable application snapshot
    -> schema and business-rule validation
    -> conditional/repeated document mapping
    -> original PDF + Typst overlay + Rust composition
    -> independent PDF verification
    -> atomic application package
```

The engine owns compilation of a single application into multiple documents. It does not own the persistent profile, user identity, login/MFA, a database, UI, an HTTP server, or government submission. The frontend is a separate teammate's responsibility. Do not implement their adapter or assume browsers can execute native Rust, Typst, or Poppler.

Application-local changes must never silently update a persistent profile. Every PDF must use the same frozen snapshot. Preserve other contributors' changes. Work on a `codex/` branch based on the actual current remote base; never push directly to `main`. Commit and push verified milestones to the working branch, clearly labeling WIP and incomplete verification. Do not open or merge a PR without further instructions.

Use only public blank forms and fictional data in isolated test directories. Never read, scan, copy, or use `augvant-client-data`.

## Fixed stack and module responsibilities

- Rust 2024 Cargo workspace, with a pinned Rust toolchain and committed Cargo.lock.
- `zero-form-core`: library owning contracts and behavior.
- `zero-form-cli`: native `zero-form` executable, limited to argument parsing, JSON/file I/O and library calls.
- Serde for closed input contracts; Schemars exports schemas from the Rust types.
- JSON Schema 2020-12 for application data. Explicitly reject schema references in this iteration; no network or arbitrary local-file resolution.
- lopdf for actual PDF objects and content streams; ttf-parser for glyph coverage and measurements.
- Typst 0.15.1 executable for text/checkbox overlays. Do not embed its compiler or introduce a second layout engine.
- Poppler for independent text extraction and raster verification. Record exact tool versions; the tested baseline is Poppler 26.05.0.
- Local JSON/files. No TypeScript, React, C#, FFI, WASM, database, OCR, model call, or document framework in the core.

Keep the implementation small. Modules may be single Rust files:

| Module | Owns |
| --- | --- |
| `contracts` | Requests, facts, relationships, rules, mappings, templates, snapshots and results |
| `definition` | Definition integrity, reference checks, asset hashes and path confinement |
| `facts` | Host interface, authorized consistent read, role resolution, snapshot integrity |
| `mapping` | Closed transformations, three-valued conditions, semantic rules and document plans |
| `pdf` / `composition` | Static PDF inspection, font fit, bounded tool execution and resource-isolated composition |
| `verification` | Field-position text readback, checkbox evidence, independent raster preservation |
| `package` | Candidate artifacts, private staging, publication reauthorization and atomic output |
| `engine` | A small orchestration API |

Use the actual current interfaces when continuing existing work. Explain any necessary interface change before downstream integration depends on it.

## Semantic and trust contracts

A request specifies its ID, application type, scope, effective date, and explicit role-to-entity bindings. A definition supplies its own version, effective period, semantic schema, role/predicate selectors, rules, document composition, mappings, and versioned templates.

Facts contain identity, subject, predicate, typed JSON value, revision, source, confirmation state, validity period and optional verification-event reference. Relationships carry endpoints, kind, application scope, version, source and validity period. A host read is one consistent authorized version with an authorization decision/grant reference.

Keep these distinct:

1. Permission to read/use a fact.
2. A business relationship such as representative authority.
3. Evidence that an update passed an identity check.

An MFA event does not create representative authority or prove the underlying fact true. A client-supplied JSON boolean is not an authorization provider. Expose an injectable `FactSource` implemented by the trusted host. The host supplies a consistent authorized read and reauthorizes the complete snapshot immediately before publication using current authorization time. The request's effective date is not the current clock.

Provide an explicit `fixture_only` adapter for the demo. It must enforce its scope, grant expiry, allowed fact/relationship IDs and approved definition hash, and authenticate the whole snapshot rather than trusting a client-recomputed content hash. State that this adapter is not production identity/security infrastructure. Unauthorized values must not enter snapshots, issues, logs or outputs.

Resolve fields using exact entity and predicate bindings. Never fuzzy-match people by similar field names. Distinguish `known`, `missing`, `unknown`, `conflict`, and `not_applicable`. Multiple effective facts are a conflict; do not silently choose the newest. An unknown checkbox/condition is not false.

Snapshots freeze the request, role bindings, selected facts and relationship revisions, evidence, read/grant references and definition hash. Hash deterministic JSON with recursively ordered object keys; arrays retain their order. New facts create a new snapshot and leave the previous one unchanged. Offline reproduction does not imply permission to publish an old snapshot today. The fixture adapter may only authorize its current read version; historical authorization is a future host responsibility.

Validate definitions before asking the host for personal data. Semantic schema keys must match field selectors. Rules are a closed typed set: conditional presence, equality, membership, exact integer sums with explicit unit and checked overflow, date order, relationship validity, and boolean choice cardinality. Use three-valued conditions; unknown conditions must block affected documents. Fixture rules must be labeled fixture policy, not presented as official law.

## Mapping and PDF contract

Map semantic fields into named template targets using explicit bindings. Support fixed documents, conditional documents, and repeated documents with stable unique record IDs. Each output write records its source field/fact/revision/source reference, transformation and physical target. Supported transforms are identity, uppercase, ROC date, string joining, fixed affixes and verified suffix removal. No arbitrary scripts or template code supplied by clients.

Templates pin the original PDF and font by SHA-256, plus a version. Coordinates are points with a top-left origin. Targets specify page, rectangle, control type, text size and whether an applicant, authority or signatory fills them. Only applicant targets may be mapped. Non-overlapping named target rectangles are the only writable regions; everything else is protected.

Support static blank text fields, explicit boolean marks and repeated whole templates. Typst generates only added content; compose that as isolated Form XObjects over the original pages. Preserve the source document and its page content. Do not rebuild the government form in Typst, paint white over unknown content, or delete unsupported structures to make a file pass.

Pin a distributable font with its license; use no silent system-font fallback. Check the actual font family, glyph coverage, ink bearings and fit. Reject overflow rather than clipping, shrinking, moving boundaries or inventing continuation pages. Signature, stamp and authority fields stay protected.

Inspect and reject unsupported PDF features explicitly: encryption, signatures, interactive forms/annotations, page rotation, nontrivial crop boxes and unsupported coordinate systems. General text replacement, placeholder removal, OCR/scans, arbitrary table expansion and AcroForm/XFA are outside this iteration. Bound file/page/record/field sizes and child-process timeouts. Do not claim this is a hardened hostile-PDF sandbox.

## Verification and publication

Keep four kinds of evidence distinct: authorized context, application semantics, document composition/mapping, and actual PDF output. Passing one is not evidence for another. Format checks are not legal eligibility or fact verification.

Read back expected values inside their registered field rectangles, not by searching the whole document. Check selected and unselected checkbox regions. Rasterize both source and candidate with Poppler at 144 and 288 DPI; reject any pixel changes outside the permitted write regions. Check page count/geometry and blank-field preconditions. Protect template hashes and ensure all expected documents are present with no extras.

Generate candidates separately from published output. During publication, make a private copy, independently verify that copy, reauthorize, write the evidence and manifest, then atomically rename the whole directory into place. Preserve the verified PDF bytes; do not regenerate the published documents. Use a per-output lock and reject overwrite/replay into an existing destination. No partially published package on failure.

A successful package contains:

```text
manifest.json
application.snapshot.json
application.data.json
provenance.json
definition.json
validation.json
documents/*.pdf
```

The manifest distinguishes submission documents from internal evidence and records hashes. It is descriptive evidence, not a signature or a trusted authorization credential. Clearly identify fixture trust and filing limitations.

## Executable milestone and handoff

Provide `doctor`, `schema`, `inspect`, `check-definition`, `prepare`, `render`, `verify`, `publish`, and `run` commands. Return structured JSON errors and nonzero exit status for failures. Missing data must identify actionable field locations and resolved states. Freeze snapshots without overwriting an existing snapshot file.

Keep runnable fixtures in `bench/demo` and pinned assets in `assets`. Demonstrate one official blank PDF plus synthetic templates with visibly distinct fictional representative/contact identities, one conditional document, and repeated branch records. Verify the expected five-document set. Label the partially populated official example as a demonstration, not a completed filing.

Test role isolation, unauthorized data, missing verification evidence, missing/wrong-scope relationships, conflicts, unknown/false conditions, repeated IDs, immutable snapshots, tampering despite recomputed hashes, revoked/expired grants, definition drift, exact sums/overflow, protected targets, wrong template hashes, unsupported PDFs, text overflow and atomic publication failure. Run external-tool tests explicitly and inspect the rendered pages.

Write a concise English README for frontend integration: branch/commit, exact CLI commands, schema retrieval, input/output JSON paths, success and missing-data/error handling, tested evidence, blockers, limitations and the next deliverable. State that an HTTP adapter is not provided. Do not create architecture documents or build unrelated product layers.

Complete the authorized implementation and checks. Report actual results; keep unfinished items explicit. Do not rerun passing checks without a change, failure or new evidence.
