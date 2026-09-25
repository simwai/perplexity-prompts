# DOC_DRIFT — Documentation Regression Report

- **Date/time:** 2026-09-25T05:17:00Z
- **Branch analyzed:** master (requested `dev`; `dev` not present locally)
- **Files reviewed:** README.md, docs/QUICKSTART.md, docs/REFERENCE/SYSTEM_OVERVIEW.md, docs/USER_GUIDE/OPENCODE.md, docs/USER_GUIDE/PERSONAS.md, docs/USER_GUIDE/PHASES.md, docs/REFERENCE/RUBRICS.md, AGENTS.md, prompt-system/00-system.md
- **Regressions found:** 5

## Fixes Applied

- **QUICKSTART.md** — Removed stale `echo "EXA_API_KEY=exa-xxx" > .env` setup block; Exa is removed from the system (Google curl fallback). Updated service table to remove Exa, add Google Search. Updated "Verify It Works" to remove Exa reference.
- **QUICKSTART.md** — Added missing commands to Essential Commands table: `/close`, `/consensus`, `/feedback`.
- **SYSTEM_OVERVIEW.md** — Removed `BOOTSTRAP.md` from file map (file does not exist in repo).
- **SYSTEM_OVERVIEW.md** — Fixed `project-management/` → `PROJECT_MANAGEMENT/` (case mismatch).
- **README.md** — Fixed "9 system files (00-08 + rules)" → "8 system files (00-08)".
- **OPENCODE.md** — Added missing commands: `/close`, `/consensus`, `/feedback`, `/feedback-status`, `/kickoff`.

## Regressions Detail

| # | File | Issue | Severity |
|---|---|---|---|
| 1 | docs/QUICKSTART.md | Stale Exa API key setup contradicts AGENTS.md "never hardcode tokens" | High |
| 2 | docs/QUICKSTART.md | Exa listed as Tier 2 service; removed from system | High |
| 3 | docs/REFERENCE/SYSTEM_OVERVIEW.md | BOOTSTRAP.md listed but file missing | Medium |
| 4 | docs/REFERENCE/SYSTEM_OVERVIEW.md | `project-management/` lowercase vs actual `PROJECT_MANAGEMENT/` | Medium |
| 5 | README.md | "9 system files" vs actual 8 | Low |
| 6 | docs/USER_GUIDE/OPENCODE.md | Missing `/close`, `/consensus`, `/feedback`, `/feedback-status`, `/kickoff` | Medium |
| 7 | docs/QUICKSTART.md | Missing `/close`, `/consensus`, `/feedback` in Essential Commands | Medium |
