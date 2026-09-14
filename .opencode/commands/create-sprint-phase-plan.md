---
description: Create a sprint phase plan from an existing roadmap. Generates a sprint file or Trello board with stories and tasks.
---

Create a sprint phase plan from a roadmap. `$ARGUMENTS` specifies the roadmap ID/title and optional sprint name and target date.

Before acting:

1. Read `prompt-system/00-system.md` (orchestrator + routing + execution modes).
2. Read the session's own state file `SESSION_STATE-<session_id>.md` if present.
3. Read `project-management/config.md` to determine the active backend.
4. Read `prompt-system/07-protocols.md` `## Scrum planning` for sprint conventions (ICE scoring, size bands, milestones, task-card enrichment).

Then:

## File-based backend (`backend: file`)

1. Locate the source roadmap file: `project-management/roadmap-NNN.md`.
2. If not found, emit `[PHASE: BLOCKED]` with: "source roadmap not found. Create or identify a roadmap first with /create-roadmap or /edit-roadmap."
3. Determine the next sprint number: scan `project-management/sprint-*.md`, increment the highest sequence.
4. Write `project-management/sprint-NNN.md` with this structure:

```markdown
---
id: sp-NNN
roadmap_id: rm-NNN
sprint_name: <sprint name from $ARGUMENTS or auto-generated>
target_date: YYYY-MM-DD
status: active
stories:
  - id: US-001
    goal: |
    features: []
    tasks: []
    blockers: []
    size: S
    ice: 0
    milestone: ""
    definition_of_done: ""
---

## Sprint Goal
<sprint goal from $ARGUMENTS>

## Stories
<!-- Add stories with /edit-sprint-phase-plan -->

## Milestones
<!-- Add milestones here -->

## Definition of Done
<!-- Add DoD criteria -->

## ICE Scores
<!-- Score each story: Impact * Confidence * Ease -->

## Blockers
<!-- Track blockers here -->
```

5. Populate stories from the roadmap's phases/items.
6. Emit confirmation with the sprint file path and story count.

## Trello backend (`backend: trello`)

1. Find the roadmap board via `list_boards`.
2. Create a new board or list for the sprint via `add_list_to_board`.
3. For each roadmap item, create a card via `add_card_to_list` with the story goal as the card description.
4. Add labels for priority/size/phase.
5. Record the sprint board ID in `project-management/config.md`.
6. Emit confirmation with the Trello board URL.

## Common

- If `$ARGUMENTS` is empty, emit `[PHASE: BLOCKED]` with: "sprint name and roadmap ID are required".
- Follow scrum conventions from `prompt-system/07-protocols.md`: ICE scoring, size bands (XS/S/M/L), milestones, task-card enrichment rules.
- Record the sprint ID in the session state file under `## Project Management`.
