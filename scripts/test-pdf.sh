#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/tools.sh"
cd "$ZERO_FORM_ROOT"
cargo test --workspace --locked --test pdf_pipeline -- --ignored
