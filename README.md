# AXD — Verified Semantic Application Workflow

Hackathon PoC: verified semantic profile → zero-refill application assembly → confirmed immutable snapshot → multi-document generation → government-side verification and decision.

## Core engine — WIP hackathon milestone

The Rust core now compiles fixture-authorized semantic facts into an immutable application snapshot, validates application rules, maps conditional/repeated documents, and publishes a verified PDF package atomically.

The demo produces five PDFs (six pages), including three populated fields on a public Taiwan company application form. Other templates and all filled values are synthetic. This is not a complete government filing.

- Rust 1.97.1 / edition 2024; `zero-form-core` library and `zero-form` CLI.
- Typst 0.15.1 generates overlays; the extracted AXD Form XObject compositor preserves existing page content.
- Poppler 26.05.0 independently verifies field text and protected pixels at 144/288 DPI.
- Host integration is through `FactSource`; the local adapter explicitly uses `fixture_only` trust. No real MFA, profile database, UI, or submission API is implemented.

```sh
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo run --locked -p zero-form-cli -- --help
```

Set `ZERO_FORM_TYPST`, `ZERO_FORM_PDFTOPPM`, and `ZERO_FORM_PDFTOTEXT` if these tools are not on PATH. Run the external-tool tests explicitly:

```sh
cargo test --locked -p zero-form-core --test pdf_pipeline -- --ignored
```

Remaining before the local handoff: portable demo scripts, English implementation prompt, and final integration review. Production authorization/history adapters and comprehensive government form mappings remain outside this milestone.
