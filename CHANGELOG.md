# Changelog

All notable changes to `simwai/perplexity-prompts` are documented here.
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- Safer OpenCode defaults: the loader is explicitly configured, MCP packages are
  version-pinned, and planning is the default native agent.
- Architecture and protocol conformance guides for maintainers and students.
- `modules/30-execution-modes.txt` — adaptive `AUTO`, `DIRECT`, and `STRUCTURED` routing with explicit low-risk direct execution and safety-preserving verification.
- OpenCode `/direct`, `/structured`, and `/auto` commands for overriding adaptive mode selection.
- `modules/00-persona-system.txt` — always-loaded persona overview and recommended session flow (content moved out of bootstrap).
- OpenCode native Plan/Build overrides: `.opencode/agents/plan.md` (BabaSensei, read-only) and `.opencode/agents/build.md` (BabaDev, approval-gated).
- OpenCode commands: `/approve-plan`, `/handoff`, `/resume`, `/verify` under `.opencode/commands/`.
- `SESSION_STATE.md` fields for review decision, plan approval, and verification results.
- BabaDev PATCH verification gate: inspect diff, run relevant project checks when available, record results.
- `modules/28-app-lifecycle.txt` — startup validation, fail-fast configuration errors, and bounded graceful shutdown guidance.
- `modules/29-library-selection.txt` — value density, maintenance, security, type safety, dependency footprint, migration, and distribution-aware license selection criteria.
- Restructured into a one-file + one-folder deployable layout: `bootstrap.txt`, `modules/`, and `personas/` moved under `system/`; `AGENTS.md` is now a slim entry pointer with a Deploy section. `README.md`, `docs/AGENTS-usage.md`, and `.pre-commit-config.yaml` updated to the new paths.
- Personas are now modules: `system/personas/` removed, personas moved into `system/modules/` as `23-babascrummaster.txt`, `24-babasensei.txt`, `25-babadev.txt`, `26-babatester.txt`, `27-babareviewer.txt`. The deployable unit is now just `bootstrap.txt` + `modules/`. `AGENTS.md`, `README.md`, `docs/AGENTS-usage.md`, and `modules/12-module-routing.txt` updated to the new layout. Session flow folded into `bootstrap.txt`.
- `modules/21-mcp-invocation.txt` — decision guidance for when to invoke each MCP: signal-to-tool matrix, phase pairing, no-go rules (built-ins first, one call per evidence gap, no secrets through remote endpoints), and keyless web-search fallback via direct curl to Google's URL format.
- `modules/20-database-conventions.txt` — recreated the missing file referenced by module routing, extracted from the Database conventions section in `bootstrap.txt`.
- Registered `21-mcp-invocation.txt` as always-loaded in `modules/12-module-routing.txt`.
- MCP set change: removed GitHub, GitLab, and Google Search MCP servers (plus `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITLAB_PERSONAL_ACCESS_TOKEN`, `GOOGLE_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID`); added Trello (remote OAuth, `https://mcp.trello.com/v1`) and Playwright (`npx -y @playwright/mcp@latest`).
- `AGENTS.md`, `docs/AGENTS-usage.md`, and `README.md` updated to reflect the new MCP set and the curl-based Google search fallback.
- `bootstrap.txt` — added Tool Sourcing section pointing to `modules/21-mcp-invocation.txt`.
- `modules/13-persona-handoff-contract.txt` — structured handoff contract that any persona must emit before another persona may begin. Defines required payload fields, receiving-persona validation rules, and the HANDOFF template.
- `modules/15-artifact-handling.txt` — LLM instructions for artifact hygiene: what counts as an artifact, `.gitignore` authoring rules, committed-credential H1 violation, and REVIEW/PLAN/PATCH enforcement.
- `modules/16-pre-commit-behavior.txt` — LLM instructions for pre-commit reasoning: formatter-first order (`prettier --write` / `ruff format`), linter second, explicit `tsc --noEmit` for TypeScript, secret scanner as H1-adjacent, broken hook as hard-tier blocker.
- `modules/17-cross-team-requirements.txt` — LLM instructions for cross-team handoffs: when and how to write `CHANGES_REQUIRED.md`, mandatory entry template, priority definitions, and audit-trail rules.
- `modules/18-discuss-mode.txt` — LLM instructions for the `DISCUSS` phase: protocol-free expert conversation mode, entry/exit triggers, promotion rules for carrying conclusions into formal phases.
- `modules/19-session-state.txt` — LLM instructions for `SESSION_STATE.md`: temp per-session state file spec, read/write rules, mid-session persona switch protocol, cleanup rule.
- `modules/11-state-machine.txt` — added `DISCUSS` to the phase set; added `ANY PHASE -> DISCUSS` and `DISCUSS -> <prior_phase>` transitions; added hard guards for DISCUSS.
- `modules/12-module-routing.txt` — added `TEST_STRATEGY` and `HANDOFF` phase routing; added `DISCUSS` phase routing (modules 18 + 19); added conditional loading of modules 15, 16, 17; added multi-persona session additions (modules 13 + 19).
- `bootstrap.txt` — added discussion-only session type; added Step 3 multi-persona script with DISCUSS handling; added Step 4 mid-session persona switch script; updated ownership rules for modules 13, 18, 19.
- `opencode.jsonc` — opencode-native config: `instructions` auto-loads `AGENTS.md` and `system/bootstrap.txt`; `mcp` registers context7, tavily, playwright, exa (`{env:EXA_API_KEY}`), and trello (remote OAuth). Inert for non-opencode agents; `AGENTS.md` + `system/` remain the portable deploy unit.
- `.opencode/agent/baba-scrummaster.md`, `baba-sensei.md`, `baba-dev.md`, `baba-tester.md`, `baba-reviewer.md` — the five personas as opencode agents (`mode: primary`). `edit: deny` on all but `baba-dev`. Each references `system/modules/` instead of duplicating persona content.
- `.opencode/command/baba.md` (`/baba <persona>`) and `.opencode/command/phase.md` (`/phase <NAME>`) — opencode command entry points.
- `README.md` and `docs/AGENTS-usage.md` — document the optional opencode layer.
- `CHANGELOG.md` — this file.
- `.gitignore` — artifact exclusions for the repo itself, including `SESSION_STATE.md`.
- `.gitattributes` — normalize all text files to LF on commit and checkout (`* text=auto eol=lf`).
- `modules/15-artifact-handling.txt` — added `.gitattributes` authoring defaults, a review rule (missing or CRLF-forcing `.gitattributes` is a soft-tier finding), and a spawn rule (new repos get `* text=auto eol=lf`). House preference is LF for all text files, including on Windows.
- `modules/16-pre-commit-behavior.txt` — file-hygiene hook now covers LF line endings alongside trailing whitespace and end-of-file newline.
- `bootstrap.txt` — command-line and workflow defaults note the `.gitattributes` LF preference, cross-referencing module 15.
- `modules/31-loop-guards.txt` — loop protection for repeated identical read
  steps (doom loops): three consecutive identical read fingerprints with no
  state change are a protocol breach that stops or blocks, preventing
  loop-prone models (Grok-class) from draining the credit budget. Registered as
  always-loaded in `modules/12-module-routing.txt` and listed in `bootstrap.txt`.
- `opencode.jsonc` — `permission.doom_loop` set to `deny` (hard-stops three consecutive identical tool calls at the process level instead of the default `ask`) and `tool_output` limits (`max_lines`/`max_bytes`) added to cap oversized read output.
- `.opencode/agents/*.md` — per-agent `steps` caps added (`build.md` 100, `plan.md` 50, `baba-*.md` 40) so a looping agent is forced to text-only instead of looping on `Infinity`.
- `modules/09-failure-guards.txt` — added the repeated-identical-read breach condition (doom loop) to the protocol breach list.
- `modules/19-session-state.txt` — added the `Read Ledger` section (one fingerprint per read step) to make repeat detection durable across turns.
- `modules/21-mcp-invocation.txt` — added a no-go rule against re-invoking a lookup whose fingerprint already produced a result this session.
- `modules/30-execution-modes.txt` — DIRECT mode now forbids repeating an identical read step without a state change.

### Changed
- `system/bootstrap.txt` is now a **module loader only**; canonical rules live in `system/modules/`.
- Removed standalone `CONFIRM` phase. Core flow is `CHECKLIST -> DOCS -> REVIEW -> PLAN -> PATCH`. REVIEW owns the confirmation decision section.
- OpenCode discovery paths moved to documented plurals: `.opencode/agents/` and `.opencode/commands/`.
- Read-only Baba agents now deny both `edit` and `bash`.
- `opencode.jsonc` sets `default_agent: "build"` and continues auto-loading `AGENTS.md` + loader.
- `modules/12-module-routing.txt` and `modules/13-persona-handoff-contract.txt` — stale `GuidedSeniorDev` references aligned to `BabaDev`.
- `docs/AGENTS-usage.md` — added BabaScrumMaster to the Persona Reference table and the optional upstream pipeline to the Phase Flow.
- `AGENTS.md`, `system/`, and all shared modules remain portable and model-agnostic; the opencode layer adds no dependencies for other agents.

### Removed
- `role-legend.md` — obsolete root-level role table, superseded by the Persona System section in `bootstrap.txt` and the persona modules. Was stale (five roles, missing BabaScrumMaster) and referenced nothing.
- `scripts/pre-commit-check.sh` and `scripts/pre-commit-check.ps1` — replaced with LLM instruction module 16. Removed entirely.
- `.pre-commit-config.yaml` — replaced with LLM instruction module 16. Stub file remains for reference.

### Fixed
- `modules/27-babareviewer.txt` — responsibilities line now reads H1–H10 instead of H1–H9; added a Terminal phase section clarifying the reviewer audits patches and never authors them.
- `modules/07-output-contracts.txt` — CHECKLIST template hard-tier line now lists H1–H10 instead of H1–H9.
- Persona modules 23–27 — module-loading sections de-duplicated: they now defer to `12-module-routing.txt` and list only persona-specific additions, eliminating the contradiction with the always-loaded set.
- `modules/16-pre-commit-behavior.txt` — Python pre-commit type check and detection now use `pyright` instead of `mypy`, matching the house stack.
- `modules/02-workflow.txt` — `DISCUSS` added to the Active phases list; `bootstrap.txt` phase diagram now annotates `DISCUSS`; `.opencode/command/phase.md` accepts `DISCUSS`.
- `CHANGELOG.md` — merged duplicate `[Unreleased]` sections.

---

## [1.0.0] — 2026-05-17

### Added
- Updated `README.md` and `docs/AGENTS-usage.md` to support the MCP-enabled agent instructions.
- Initial release of the phase-oriented prompt system.
- Modules 01–12 and 14 covering orchestration, workflow, docs research, review rubrics (hard/soft), fix-and-patch protocol, output contracts, interaction layer, failure guards, decision-and-intake, state machine, module routing, and implementation style.
- Personas: `babasensei.txt`, `babatester.txt`, `guided-senior-dev.txt`.
- `AGENTS.md` synthesized overview for autonomous agent use.
- `bootstrap.txt` launcher guide.
- `role-legend.md` persona role table.
