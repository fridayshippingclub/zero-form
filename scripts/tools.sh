#!/usr/bin/env bash
# Source this file from a script; explicit overrides take precedence.
ZERO_FORM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
zero_form_tool() {
  local variable="$1" binary="$2" selected="${!1:-}"
  if [[ -z "$selected" && -x "$ZERO_FORM_ROOT/.tools/bin/$binary" ]]; then
    selected="$ZERO_FORM_ROOT/.tools/bin/$binary"
  fi
  if [[ -z "$selected" ]]; then selected="$(command -v "$binary" || true)"; fi
  if [[ -z "$selected" ]] || ! command -v "$selected" >/dev/null 2>&1; then
    printf 'Missing %s. Install it or set %s to its executable path. See README.md.\n' "$binary" "$variable" >&2
    return 1
  fi
  export "$variable=$selected"
}
zero_form_tool ZERO_FORM_TYPST typst
zero_form_tool ZERO_FORM_PDFTOPPM pdftoppm
zero_form_tool ZERO_FORM_PDFTOTEXT pdftotext
