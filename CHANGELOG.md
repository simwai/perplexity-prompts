# Changelog

All notable changes to `simwai/perplexity-prompts` are documented here.
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- `modules/13-persona-handoff-contract.txt` — structured handoff contract that any persona must emit before another persona may begin. Defines required payload fields, receiving-persona validation rules, and the HANDOFF template.
- `CHANGELOG.md` — this file.
- `.gitignore` — artifact handling for the repo.
- `scripts/pre-commit-check.sh` — bash pre-commit runner (Linux/macOS).
- `scripts/pre-commit-check.ps1` — PowerShell pre-commit runner (Windows).
- `.pre-commit-config.yaml` — pre-commit hook configuration.

### Fixed
- `modules/12-module-routing.txt` — added `TEST_STRATEGY` and `HANDOFF` phase routing entries referencing module 13. Previously only phases up to `PATCH` and `BLOCKED/FAILURE` had routing entries; `BabaTester`'s terminal phase was unrouted.
- `bootstrap.txt` — added explicit multi-persona session script (Step 1 → Step 2 → Step 3) and clarified entry points for `GuidedSeniorDev` when receiving from both `BabaSensei` and `BabaTester`.

---

## [1.0.0] — 2026-05-17

### Added
- Initial release of the phase-oriented prompt system.
- Modules 01–12 and 14 covering orchestration, workflow, docs research, review rubrics (hard/soft), fix-and-patch protocol, output contracts, interaction layer, failure guards, decision-and-intake, state machine, module routing, and implementation style.
- Personas: `babasensei.txt`, `babatester.txt`, `guided-senior-dev.txt`.
- `AGENTS.md` synthesized overview for autonomous agent use.
- `bootstrap.txt` launcher guide.
- `role-legend.md` persona role table.
