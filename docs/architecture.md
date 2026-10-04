# System Architecture

The Baba system has four layers:

1. `AGENTS.md` is the portable entry point.
2. `prompt-system/00-system.md` is the orchestrator, routing table, hard guards, and
   load order. It defines which files load when. Cross-references between the other
   files are by topic and anchor (`prompt-system/05-impl-style.md` `## Comments`),
   never by bare path, so the reference graph stays acyclic.
3. The phase and persona logic lives in `prompt-system/01-personas.md` through
   `prompt-system/07-protocols.md`. Phase templates, rubrics, implementation style, and
   PATCH protocol are merged in; there is no separate module per concern.
4. Adapter layers bind the portable system to agent platforms: `opencode.jsonc` and
   `adapters/opencode/**` (OpenCode), `adapters/claude/**` (Claude Code). `adapters/`
   is the source of truth; `.opencode/`, `.claude/`, and `.mcp.json` are generated
   output produced by `generate-adapters.ps1` and must never be hand-edited.

## One review path

`AUTO` chooses the execution mode. A broad or risky request enters
`CHECKLIST → DOCS (when needed) → REVIEW → PLAN → PATCH`.

Deterministic skips advance without user confirmation: `DOCS` when no version-sensitive judgment is in
scope, and the upstream ScrumMaster pipeline when a concrete target exists at session start. The skip
reason is recorded.

The optional upstream ScrumMaster pipeline (`INTAKE → BACKLOG → SPRINT → TASK_PLAN → SPEC`) runs only
when the user provides a goal without a concrete target; `SPEC` authors a spec artifact at `SPEC.md`
(planning only — spec writes happen in the SPEC phase and the spec review phase only). `DRIFT` is an optional read-only diagnostic
phase entered after `PATCH` (spec-backed sessions) or on demand from any phase; it exits to `PLAN`
(writes needed) or back to the prior phase (clean).

`REVIEW` owns confirmation. `PLAN` requires explicit approval and a complete
rewrite contract. `PATCH` is the only implementation phase.

## Portable versus adapter files

The portable deployment unit is `AGENTS.md` plus `prompt-system/`. Adapter files
(`opencode.jsonc`, `.opencode/`) are platform-specific layers owned by one agent
each; other agents ignore them entirely. `sync.ps1` propagates the portable unit
together with the adapter surfaces to configured targets.
