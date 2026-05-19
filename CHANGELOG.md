# Changelog

All notable changes to `simwai/perplexity-prompts` are documented here.
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- `modules/13-persona-handoff-contract.txt` — structured handoff contract that any persona must emit before another persona may begin. Defines required payload fields, receiving-persona validation rules, and the HANDOFF template.
- `modules/15-artifact-handling.txt` — LLM instructions for artifact hygiene: what counts as an artifact, `.gitignore` authoring rules, committed-credential H1 violation, and REVIEW/PLAN/PATCH enforcement.
- `modules/16-pre-commit-behavior.txt` — LLM instructions for pre-commit reasoning: formatter-first order (`prettier --write` / `ruff format`), linter second, explicit `tsc --noEmit` for TypeScript, secret scanner as H1-adjacent, broken hook as hard-tier blocker.
- `modules/17-cross-team-requirements.txt` — LLM instructions for cross-team handoffs: when and how to write `CHANGES_REQUIRED.md`, mandatory entry template (target, priority, context, exact change, acceptance criteria, contract delta), priority definitions, and audit-trail rules.
- `CHANGELOG.md` — this file.
- `.gitignore` — artifact exclusions for the repo itself.

### Fixed
- `modules/12-module-routing.txt` — added `TEST_STRATEGY` and `HANDOFF` phase routing entries referencing module 13; added conditional loading of modules 15, 16, and 17 for REVIEW, PLAN, and PATCH phases.
- `bootstrap.txt` — added explicit multi-persona session script (Step 1 → Step 2 → Step 3), clarified `GuidedSeniorDev` entry points, added modules 15/16/17 to phase-specific additions list and ownership rule.

### Removed / Replaced
- `scripts/pre-commit-check.sh` and `scripts/pre-commit-check.ps1` — replaced with LLM instruction module 16. Stub files remain to avoid broken references but carry no logic.
- `.pre-commit-config.yaml` — replaced with LLM instruction module 16. Stub file remains for reference.

---

## [1.0.0] — 2026-05-17

### Added
- Initial release of the phase-oriented prompt system.
- Modules 01–12 and 14 covering orchestration, workflow, docs research, review rubrics (hard/soft), fix-and-patch protocol, output contracts, interaction layer, failure guards, decision-and-intake, state machine, module routing, and implementation style.
- Personas: `babasensei.txt`, `babatester.txt`, `guided-senior-dev.txt`.
- `AGENTS.md` synthesized overview for autonomous agent use.
- `bootstrap.txt` launcher guide.
- `role-legend.md` persona role table.
