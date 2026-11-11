#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.bun/bin:${PATH}"
export GSTACK_STATE_ROOT="$ROOT/.gstack-runtime/state"
export GSTACK_SETTINGS_FILE="$ROOT/.gstack-runtime/claude-settings.json"
export GSTACK_SKIP_COREUTILS=1
mkdir -p "$GSTACK_STATE_ROOT"
if [ ! -f "$GSTACK_STATE_ROOT/config.yaml" ]; then
  printf 'telemetry: off\nupdate_check: false\nplan_tune_hooks: no\ntimeline_stop_hook: no\ncodex_reviews: disabled\n' > "$GSTACK_STATE_ROOT/config.yaml"
fi
exec .claude/skills/gstack/setup --host codex --no-team --no-browser --no-harness-auto --no-timeline-stop-hook "$@"
