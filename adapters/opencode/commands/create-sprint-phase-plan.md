---
description: Create a sprint phase plan from an existing roadmap. Generates a sprint file or Trello board with stories and tasks.
---

Create a sprint phase plan from a roadmap. `$ARGUMENTS` specifies the roadmap ID/title and optional sprint name and target date.

Before acting:

1. Read `prompt-system/00-system.md` (orchestrator + routing + execution modes).
2. Read the session context from the conversation carrier (resolved per `prompt-system/03-output-and-state.md` `## Session State (In-Session Only)`).
3. Read `project-management/CONFIG.md` to determine the active backend.
4. Read `prompt-system/07-protocols.md` `## Scrum planning` for sprint conventions (ICE scoring, size bands, milestones, task-card enrichment).
5. Read `prompt-system/15-project-documentation.md` `## Canonical scaffold` for the scaffold layout and `## Phase-to-artifact gate` for the artifact this command satisfies.

Then:

## File-based backend (`backend: file`)

1. Locate the source roadmap file: `project-management/ROADMAP_<YYYY-MM>.md`, or the `ROADMAP_*.md` file matching the roadmap ID/title in `$ARGUMENTS`.
2. If not found, emit `[PHASE: BLOCKED]` with: "source roadmap not found. Create or identify a roadmap first with /create-roadmap or /edit-roadmap."
3. Determine the next sprint number: scan `project-management/SPRINT_*.md`, increment the highest sequence.
4. Write `project-management/SPRINT_<NNN>.md` with this structure (the SPRINT template shape from `prompt-system/03-output-and-state.md`; do not invent a second schema):

```markdown
# Sprint NNN - <sprint name from $ARGUMENTS or auto-generated>

Roadmap: [ROADMAP_<YYYY-MM>.md](ROADMAP_<YYYY-MM>.md)
Sprint goal: <sprint goal from $ARGUMENTS>
Target date: YYYY-MM-DD.

## Selected items (from Backlog, in pull order)

- RM-XX -- <description> [<milestone>] [<size>]

## Board

- To do: <item ids>
- In progress: none
- Done: none

## Stories (parent item tagged, MVP tagged)

- ST-XX [P<n>] <GWT story sentence>. (parent RM-XX, core|supporting)

## ICE (I*C*E, Ease from size band: XS 8-10, S 6-8, M 4-6, L 1-4)

- RM-XX: <impact>*<confidence>*<ease> = <score> (<size>, Ease <e>)

## Completion criteria

- <observable, testable criterion>

## Task card

<!-- /edit-sprint-phase-plan appends the next task card here -->
```

Each story is scored using `ICE = Impact * Confidence * Ease`:

| Factor | Definition | Scale |
|---|---|---|
| **Impact** | How much this item moves the goal (value delivered, effort removed, risk retired) | 1-10 |
| **Confidence** | How sure we are the approach, scope, and estimate are right | 1-10 |
| **Ease** | Inverse of implementation effort, derived from the size band | see below |

Size-to-Ease mapping:

| Size | LOC band | Ease guidance |
|---|---|---|
| XS | ~50-150 | 8-10 |
| S | ~150-300 | 6-8 |
| M | ~300-400 | 4-6 |
| L | >400 | 1-4 |

Ties are broken by size (smaller first), then by milestone target date.

1. Populate stories from the roadmap's phases/items, then score each story's ICE before finalizing.
2. Emit confirmation with the sprint file path and story count.

## Trello backend (`backend: trello`)

1. Find the roadmap board via `list_boards`.
2. Create a new board or list for the sprint via `add_list_to_board`.
3. For each roadmap item, create a card via `add_card_to_list` with the story goal as the card description.
4. Add labels for priority/size/phase.
5. Record the sprint board ID in `project-management/CONFIG.md`.
6. Emit confirmation with the Trello board URL.

## Common

- If `$ARGUMENTS` is empty, emit `[PHASE: BLOCKED]` with: "sprint name and roadmap ID are required".
- Follow scrum conventions from `prompt-system/07-protocols.md`: ICE scoring, size bands (XS/S/M/L), milestones, task-card enrichment rules.
- Apply task-card enrichment: stories sharing a `Story` id belong to one user story; tasks ordered MVP-first (core before supporting); test-first flag as a plan-level ordering signal.
- Record the sprint ID in the session context (conversation carrier) under `## Project Management`.
- Populate stories from the roadmap's phases/items, then score each story's ICE before finalizing.
