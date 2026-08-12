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

`REVIEW` owns confirmation. `PLAN` requires explicit approval and a complete
rewrite contract. `PATCH` is the only implementation phase. The optional
ScrumMaster pipeline runs only when the user provides a goal without a concrete
target.

## Portable versus native files

The portable deployment unit is `AGENTS.md` plus `system/`. OpenCode-specific
commands, agents, and `opencode.jsonc` are an optional adapter layer and are not
copied by `sync.ps1`.
