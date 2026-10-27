---
description: Enter the CHECKLIST phase with file inventory, rubric coverage, and relevance discovery.
---

Enter the CHECKLIST phase. `$ARGUMENTS` may name a target scope (file, directory, or module); when empty, use the session target.

Before acting:

1. Read `prompt-system/00-system.md` `## Checklist` template and `## Discovery Protocol`.
2. Read `prompt-system/03-output-and-state.md` `## CHECKLIST template`.
3. Verify `startup_verified: true` in session context; if missing, emit `[PHASE: BLOCKED]` with reason "STARTUP incomplete".
4. Verify the target scope is known; if the target is a directory or feature area, run relevance discovery (max 15 `rg`/`glob` invocations, max 100 hits) per `07-protocols.md` `## Relevance Discovery`.

Then:

- Declare `[PHASE: CHECKLIST]` at the top of your response.
- Output only the CHECKLIST template from `prompt-system/03-output-and-state.md`.
- Pre-populate the File inventory section with discovery results (keyword-match, entry-dist, layer, test proximity).
- Tick H1-H12 and H13-H38 coverage decisions; mark L1-L10 as in scope or skipped per target type.
- Status remains `pending` for all inventory rows — REVIEW flips them later, not CHECKLIST.
