# Changelog

All notable changes to `simwai/perplexity-prompts` are documented here.
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- `AGENTS_WITHOUT_MCP.md` — lightweight version of agent instructions without Model Context Protocol (MCP) requirements.
- Updated `README.md` and `docs/AGENTS-usage.md` to support both MCP and non-MCP versions of the agent instructions.
- `modules/13-persona-handoff-contract.txt` — structured handoff contract that any persona must emit before another persona may begin. Defines required payload fields, receiving-persona validation rules, and the HANDOFF template.
- `modules/15-artifact-handling.txt` — LLM instructions for artifact hygiene: what counts as an artifact, `.gitignore` authoring rules, committed-credential H1 violation, and REVIEW/PLAN/PATCH enforcement.
- `modules/16-pre-commit-behavior.txt` — LLM instructions for pre-commit reasoning: formatter-first order (`prettier --write` / `ruff format`), linter second, explicit `tsc --noEmit` for TypeScript, secret scanner as H1-adjacent, broken hook as hard-tier blocker.
- `modules/17-cross-team-requirements.txt` — LLM instructions for cross-team handoffs: when and how to write `CHANGES_REQUIRED.md`, mandatory entry template, priority definitions, and audit-trail rules.
- `modules/18-discuss-mode.txt` — LLM instructions for the `DISCUSS` phase: protocol-free expert conversation mode, entry/exit triggers, promotion rules for carrying conclusions into formal phases.
- `modules/19-session-state.txt` — LLM instructions for `SESSION_STATE.md`: temp per-session state file spec, read/write rules, mid-session persona switch protocol, cleanup rule.
- `CHANGELOG.md` — this file.
- `.gitignore` — artifact exclusions for the repo itself, including `SESSION_STATE.md`.

### Fixed
- `modules/11-state-machine.txt` — added `DISCUSS` to the phase set; added `ANY PHASE -> DISCUSS` and `DISCUSS -> <prior_phase>` transitions; added hard guards for DISCUSS.
- `modules/12-module-routing.txt` — added `TEST_STRATEGY` and `HANDOFF` phase routing; added `DISCUSS` phase routing (modules 18 + 19); added conditional loading of modules 15, 16, 17; added multi-persona session additions (modules 13 + 19).
- `bootstrap.txt` — added discussion-only session type; added Step 3 multi-persona script with DISCUSS handling; added Step 4 mid-session persona switch script; updated ownership rules for modules 13, 18, 19.

### Removed / Replaced
- `scripts/pre-commit-check.sh` and `scripts/pre-commit-check.ps1` — replaced with LLM instruction module 16. Stub files remain to avoid broken references but carry no logic.
- `.pre-commit-config.yaml` — replaced with LLM instruction module 16. Stub file remains for reference.

---

## [1.0.0] — 2026-05-17

### Added
- `AGENTS_WITHOUT_MCP.md` — lightweight version of agent instructions without Model Context Protocol (MCP) requirements.
- Updated `README.md` and `docs/AGENTS-usage.md` to support both MCP and non-MCP versions of the agent instructions.
- Initial release of the phase-oriented prompt system.
- Modules 01–12 and 14 covering orchestration, workflow, docs research, review rubrics (hard/soft), fix-and-patch protocol, output contracts, interaction layer, failure guards, decision-and-intake, state machine, module routing, and implementation style.
- Personas: `babasensei.txt`, `babatester.txt`, `guided-senior-dev.txt`.
- `AGENTS.md` synthesized overview for autonomous agent use.
- `bootstrap.txt` launcher guide.
- `role-legend.md` persona role table.
