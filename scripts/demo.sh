#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/tools.sh"
cd "$ZERO_FORM_ROOT"
if [[ $# -gt 1 ]]; then printf 'Usage: %s [new-output-directory]\n' "$0" >&2; exit 2; fi
output="${1:-output/hackathon}"
cargo run --quiet --locked -p zero-form-cli -- doctor
cargo run --quiet --locked -p zero-form-cli -- run \
  --definition bench/demo/definition.json \
  --request bench/demo/request.json \
  --fixture-facts bench/demo/facts.json \
  --now 2026-11-11 --assets . --out "$output"
