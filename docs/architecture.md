# System Architecture

The Baba system has five layers:

1. `AGENTS.md` is the portable entry point.
2. `system/bootstrap.txt` loads the canonical modules.
3. `system/modules/12-module-routing.txt` selects modules for the active phase.
4. Phase and persona modules define gates, output contracts, and ownership.
5. Adapter layers bind the portable system to agent platforms: `.opencode/`
   plus `opencode.jsonc` (OpenCode), `CLAUDE.md` + `.mcp.json` + `.claude/`
   (Claude Code), and `.codex/config.toml` (Codex CLI). Adapter mirrors are
   generated: `generate-adapters.ps1` emits `.claude/**` and the tier-1 MCP
   blocks from `.opencode/**` and the `opencode.jsonc` `mcp` block.

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

## Portable versus adapter files

The portable deployment unit is `AGENTS.md` plus `system/`. Adapter files
(`opencode.jsonc`, `.opencode/`, `CLAUDE.md`, `.mcp.json`, `.claude/`,
`.codex/`) are platform-specific layers owned by one agent each; other agents
ignore them entirely. `sync.ps1` propagates the portable unit together with
the adapter surfaces to configured targets.
