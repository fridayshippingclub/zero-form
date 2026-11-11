# GStack project skills

Official upstream: https://github.com/garrytan/gstack

Pinned version: **1.99.0.0**, commit `f0cd9f8c4b453c1eadd714e4149174ee01179eae`.
The MIT-licensed source is vendored in `.claude/skills/gstack`, including its `LICENSE`.

After pulling, with Bun >= 1.3.3 installed (upstream recommends 1.4.2), run:

```sh
./scripts/setup-gstack.sh
```

Upstream setup recognizes the project source path and creates local Codex skills in
`.agents/skills`; reopen the project or start a new chat to discover them. Generated
registrations, dependencies, compiled tools and runtime state are not committed;
each teammate runs setup once. Claude can discover the vendored skills directly.

The wrapper disables telemetry, update checks, team auto-update hooks, optional
harness registration and timeline hooks. It isolates setup state/settings in
`.gstack-runtime`, and skips browser/font downloads. Browser-dependent skills need
an available browser or a separate browser installation before use. Skill runtime
commands should use `GSTACK_STATE_ROOT="$PWD/.gstack-runtime/state"` to retain these
local preferences. No paid reviews or background tasks are enabled by installation.

This is a pinned project installation, not upstream's auto-updating team mode.
Update the vendored source and this pin deliberately, then rerun setup.
