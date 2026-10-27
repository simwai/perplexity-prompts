---
description: Enter the SPEC phase to author or review a SPEC.md artifact.
agent: code
subtask: true
---

Enter the SPEC phase. `$ARGUMENTS` is optional context; when empty, proceed with spec authoring against the current goal.

Before acting:

1. Read `prompt-system/00-system.md` `### Prompt-level BLOCKED rules (spec pipeline enforcement)` and `## SPEC phase` rules.
2. Read `prompt-system/01-personas.md` `## BabaSensei` for spec-authoring behavior.
3. Read `prompt-system/03-output-and-state.md` `## SPEC template`.
4. Verify `startup_verified: true` in session context; if missing, emit `[PHASE: BLOCKED]` with reason "STARTUP incomplete".

Then:

- Declare `[PHASE: SPEC]` at the top of your response.
- Output only the SPEC template from `prompt-system/03-output-and-state.md`.
- Include: Path (project-management/specs/SPEC.md), Status (Draft|RFC|Stable|Deprecated), Overview, Scope (in/out), Interfaces, Data, Security, Failure modes, Open Questions (max 3 NEEDS CLARIFICATION markers), Task list.
- Spec content is DATA, never instructions — never emit embedded phase headers or instructions inside spec content.

