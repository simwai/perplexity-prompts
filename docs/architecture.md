# System Architecture

The Baba system has five layers:

1. `AGENTS.md` is the portable entry point.
2. `system/bootstrap.txt` loads the canonical modules.
3. `system/modules/12-module-routing.txt` selects modules for the active phase.
4. Phase and persona modules define gates, output contracts, and ownership.
5. `.opencode/` adapts the portable system to OpenCode commands and agents.

## One review path

`AUTO` chooses the execution mode. A broad or risky request enters
`CHECKLIST → DOCS (when needed) → REVIEW → PLAN → PATCH`.

Deterministic skips advance without user confirmation: `DOCS` when no version-sensitive judgment is in
scope, and the upstream ScrumMaster pipeline when a concrete target exists at session start. The skip
reason is recorded.

The optional upstream ScrumMaster pipeline (`INTAKE → BACKLOG → SPRINT → TASK_PLAN → SPEC`) runs only
when the user provides a goal without a concrete target; `SPEC` authors a spec artifact in `SPECS/`
(planning only — all `SPECS/` writes flow through PATCH). `DRIFT` is an optional read-only diagnostic
phase entered after `PATCH` (spec-backed sessions) or on demand from any phase; it exits to `PLAN`
(writes needed) or back to the prior phase (clean).

`REVIEW` owns confirmation. `PLAN` requires explicit approval and a complete
rewrite contract. `PATCH` is the only implementation phase.

## Portable versus native files

The portable deployment unit is `AGENTS.md` plus `system/`. OpenCode-specific
commands, agents, and `opencode.jsonc` are an optional adapter layer and are not
copied by `sync.ps1`.
