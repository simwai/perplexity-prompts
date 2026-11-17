---
name: drift
description: Enter the DRIFT phase to compare SPEC.md against code (verified/diverged/orphaned/code-exceeds-spec claims).
argument-hint: [optional context]
disable-model-invocation: true
---

Enter the DRIFT phase. $ARGUMENTS may name optional context; when empty, proceed with spec-on-disk drift analysis.

Before acting:

1. Read `prompt-system/00-system.md` `## Drift control` and `## DRIFT` template.
2. Read `prompt-system/03-output-and-state.md` `## DRIFT template`.
3. Verify `project-management/specs/SPEC.md` exists with a `version` field; if missing, emit `[PHASE: BLOCKED]` with reason "SPEC.md not found at project-management/specs/SPEC.md — cannot run DRIFT without a spec on disk".
4. Check `startup_verified: true` in session context; if missing, emit `[PHASE: BLOCKED]` with reason "STARTUP incomplete".

Then:

- Declare `[PHASE: DRIFT]` at the top of your response.
- Output only the DRIFT template sections from `prompt-system/03-output-and-state.md`.
- DRIFT is read-only — never write files, never run mutating commands.
- Record `spec_version` and `drift_findings` in session state under `## Findings Mitigations` if findings require writes.
