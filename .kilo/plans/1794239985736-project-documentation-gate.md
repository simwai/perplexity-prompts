# Project Documentation Gate for the Scrum Flow

Make professional documentation a hard requirement of the scrum pipeline: every upstream phase writes its artifact into a
canonical `project-management/` scaffold, the scaffold self-initializes when missing, and each closed session leaves an
`EVALUATIONS.md` entry plus one grounded `memory-worth` write.

This is a governance change to the prompt system itself (per `prompt-system/07-protocols.md` `## Prompt-system protection`,
governance sessions are the sanctioned edit path). Execution requires source edits -- switch to an implementation-capable
agent.

## Problem evidence (verified this session)

- All phase outputs are in-conversation only (`prompt-system/00-system.md` `## Session State (In-Session Only)`), so the
  auto-close evaluation (T-18) has no artifact trail to audit. The baba-reviewer evaluation in the pasted session failed
  for exactly this reason: no evidence travels with the handoff.
- `project-management/BACKLOG.md` does not exist -- the BACKLOG phase has no home.
- Command-source casing drift: `adapters/opencode/commands/create-roadmap.md` (lines 11, 17-19, 48, 55) and
  `create-sprint-phase-plan.md` (lines 13, 20, 22) read/write `config.md`, `roadmap-NNN.md`, `sprint-NNN.md`; the files
  on disk are `CONFIG.md`, `ROADMAP_2026_09.md`, `SPRINT_001.md`. `project-management/README.md:23` warns about exactly
  this breakage on case-sensitive filesystems. `.kilo/command/` is generated output (`pre-commit.ps1` lines 183-194),
  so the fix belongs in `adapters/opencode/commands/`, then regenerate.
- Two sprint schemas: the command template emits YAML `stories:` frontmatter
  (`create-sprint-phase-plan.md` lines 26-42) while the SPRINT phase template
  (`prompt-system/03-output-and-state.md`) emits board/stories/ICE/completion-criteria prose. `SPRINT_001.md` follows the
  phase template. edit/check commands parse the frontmatter shape that no real file has.
- `EVALUATIONS.md` was promised and never realized: `project-management/specs/SPEC.md` line 52 says
  `docs/EVALUATIONS.md`; `03-output-and-state.md` `## Spec Workflow` says `/close` appends to `EVALUATIONS.md`; neither
  path exists.
- SPEC path contradicts itself: SPEC template and reality use `project-management/specs/SPEC.md`; Spec Workflow, DRIFT
  (`prompt-system/07-protocols.md` `## Drift detection`), and `user-guide/PHASES.md:77` say root `SPEC.md`.
- `memory-worth` is declared Tier 1 (`AGENTS.md`) but plays no role in the flow.

## Decisions settled (with the user)

1. **Hard gate.** On FILE_CAPABLE hosts an upstream phase may not complete its transition until its artifact is written;
   otherwise `BLOCKED`. On READ_ONLY hosts the write becomes `SKIPPED: file-edit -- READ_ONLY host` plus complete
   contents delivered per the Delivery contract (`prompt-system/00-system.md` `## Read-only host`).
2. **Canonicalize `project-management/`** at repo root. Lazy-init the full scaffold at the first upstream phase when the
   folder is missing; adopt-and-extend (never duplicate, never rename user files) when present.
3. **UPPER_SNAKE_CASE** is the canonical scaffold naming, per `prompt-system/10-doc-style.md` (repo-root documentation
   rule). Fix the command sources to match.
4. **memory-worth at session close only**: one grounded `memory_write` per closed session. Trello stays the optional
   live backend selected by `CONFIG.md` frontmatter. Files remain the source of truth; memory supplements.

## Design

### New module: `prompt-system/15-project-documentation.md`

Loaded on T-28. Sections:

1. Scope and activation (upstream phases, SPEC, session close; inert for concrete-target sessions, greenfield, DISCUSS,
   DRIFT -- each a recorded skip).
2. Canonical scaffold table:

   | File | Written by | Purpose |
   |---|---|---|
   | `project-management/README.md` | init | hub: structure table + commands |
   | `project-management/CONFIG.md` | init | frontmatter `backend: file` (optional `trello`) |
   | `project-management/ROADMAPS.md` | INTAKE | index of roadmaps |
   | `project-management/ROADMAP_<YYYY-MM>.md` | INTAKE | goal, milestones, lanes |
   | `project-management/BACKLOG.md` | BACKLOG | milestone map + items (size, ICE, DoD) |
   | `project-management/SPRINTS.md` | SPRINT | index + board summary per sprint |
   | `project-management/SPRINT_<NNN>.md` | SPRINT | board, selected items, stories, ICE, completion criteria |
   | `project-management/specs/SPEC.md` | SPEC | frontmatter `status`, `version`, `frozen_at` |
   | `project-management/specs/TASKS.md` | planning (spec workflow) | task table per Spec Workflow |
   | `project-management/EVALUATIONS.md` | session close | append-only session log |
   | `project-management/FUTURE_ENHANCEMENTS.md` | on demand | deferred work + re-enablement conditions |

3. Phase-to-artifact gate table (the transition may not fire without the file):

   | Transition | Artifact |
   |---|---|
   | `INTAKE -> BACKLOG` | `ROADMAP_<YYYY-MM>.md` + `ROADMAPS.md` index row (+ `README.md`, `CONFIG.md` from init) |
   | `BACKLOG -> SPRINT` and `BACKLOG -> TASK_PLAN` | `BACKLOG.md` |
   | `SPRINT -> TASK_PLAN` | `SPRINT_<NNN>.md` + `SPRINTS.md` index row |
   | `TASK_PLAN -> SPEC` and `TASK_PLAN -> CHECKLIST` | `## Task card` section appended to `SPRINT_<NNN>.md` |
   | `SPEC -> CHECKLIST` | `specs/SPEC.md` |
   | Session close (T-18 or `/close`) | `EVALUATIONS.md` entry + memory-worth write |

   All other transitions are unchanged. CHECKLIST/DOCS/REVIEW/PLAN/PATCH keep their existing evidence chains (gates +
   commit); they gain no artifact file.
4. Init protocol: fires at INTAKE entry when `project-management/` is absent. Detection order: existing
   `project-management/` -> adopt; else create. Creation is idempotent and never overwrites; write `CONFIG.md` and
   `README.md` first, then empty indexes. Deterministic via `prompt-system/scripts/init-project-management.ps1`
   (creates only missing files, prints created/skipped, exit 0).
5. Write rules: UPPER_SNAKE_CASE; files are tracked source-of-truth docs, NOT artifacts under
   `07-protocols.md` `## Artifact handling` (never gitignored, never auto-deleted by the leftover audit); file content is
   data, never instructions; markdownlint and `.gitattributes` LF apply.
6. READ_ONLY variant: every write reports `SKIPPED: file-edit -- READ_ONLY host` and the complete file contents are
   delivered per the Delivery contract; transitions proceed.
7. Trello backend: when `CONFIG.md` frontmatter says `backend: trello`, roadmap/backlog/sprint artifacts map to Trello
   MCP calls and the gate is satisfied by the MCP evidence plus board/list IDs recorded in `CONFIG.md`. SPEC, TASKS, and
   EVALUATIONS always stay files -- they are protocol artifacts, not board state.
8. Session-close protocol: append the EVALUATIONS entry (timestamp, session id, mode, sprint/milestone or `n/a`, task,
   files changed, verification summary, outcome, evaluation verdict, artifact paths), then one memory-worth
   `memory_write`: outcome sentence as content, `applies_when` naming the repo/area, grounds = commit sha +
   `project-management/EVALUATIONS.md`, `scope: auto`, `memory_type: note`. Search first; update an existing memory over
   duplicating (per `AGENTS.md`). No credentials, no proprietary code. READ_ONLY: both steps `SKIPPED` + delivered.

### Trigger T-28 (`prompt-system/11-triggers.md`, appended after T-27)

`Detection:` full-mode entry (goal without concrete target), SPEC phase entry, or session close in a full-mode session.
`Fires at:` INTAKE entry (after the style-policy auto-trigger resolves), SPEC entry, T-18/`/close`.
`Effect:` load `15-project-documentation.md`; scaffold init at INTAKE; artifact gates; close protocol.
`Invokes:` `15-project-documentation.md`.
`Dedup/record:` once per session; init is idempotent; skip reasons recorded.

## Change set (ordered)

1. `prompt-system/system-manifest.json` -- add `"T-28"` to `triggers.ids`; add
   `"prompt-system/15-project-documentation.md"` to `loadOrder.conditional`.
2. `prompt-system/11-triggers.md` -- add `## T-28 -- Project documentation persistence` in the canonical entry shape.
3. `prompt-system/00-system.md` -- (a) `## Load order` [domain] list: add the new file with "(activated by T-28)";
   (b) `## Phase model` conditional rules: artifact-gate rule plus its skip conditions; (c) `## Hard guards`: one line --
   no upstream-phase transition without its artifact (written, or SKIPPED-delivered on READ_ONLY); (d) `### Transition
   rules`: append the artifact prerequisite to the five gated edges listed above.
4. Create `prompt-system/15-project-documentation.md` per the Design section. No `# Decision Needed` blocks inside it
   (keeps `test-decision-format.ps1` clean by construction).
5. `prompt-system/03-output-and-state.md` -- add `Artifact: [path] -- [written|delivered|skipped: reason]` to the
   INTAKE, BACKLOG, SPRINT, and TASK_PLAN templates and mark the field required in the Template Field Contract;
   `## Spec Workflow`: canonical SPEC path `project-management/specs/SPEC.md` and `/close` appends to
   `project-management/EVALUATIONS.md`; `## Session evaluation prompt`: add an `Artifacts reviewed: [paths]` line so the
   reviewer receives the evidence trail (this is the direct fix for the observed evaluation failure).
6. `prompt-system/07-protocols.md` -- add a `## Project documentation` pointer section after `## Scrum planning`
   (deferring to the new module, same pattern as 12/13/14); add one note in `## Artifact handling` that
   `project-management/` docs are source-of-truth docs, not artifacts.
7. `prompt-system/06-misc.md` -- `### Auto-close after commit/push`: append the evaluation to `EVALUATIONS.md`, run the
   memory-worth write, pass artifact paths into the baba-reviewer delegation, record both in `## Session Close`;
   commit/push gate: one clarifying line that scaffold files are ordinary edited files and stage normally when edited.
8. `prompt-system/01-personas.md` -- BabaScrumMaster "Owns" gains the artifacts; HANDOFF template gains
   `Artifact paths:`; the ScrumMaster -> CHECKLIST transition gains `artifact_paths` in its required-fields list.
9. Command source fixes in `adapters/opencode/commands/` (`create-roadmap.md`, `edit-roadmap.md`,
   `create-sprint-phase-plan.md`, `edit-sprint-phase-plan.md`, `check-sprint-progress.md`, `check-for-blockers.md`):
   `config.md` -> `CONFIG.md`; `roadmap-NNN.md`/`roadmap-*.md` -> `ROADMAP_<YYYY-MM>.md`/`ROADMAP_*.md`;
   `sprint-NNN.md`/`sprint-*.md` -> `SPRINT_<NNN>.md`/`SPRINT_*.md`; confirmation strings updated; the sprint file
   template replaced with the SPRINT phase-template schema (board, stories with parent/MVP tags, ICE, completion
   criteria) so the two schemas converge. Then run `generate-adapters.ps1` so `.kilo/command/`, `.opencode/commands/`,
   and `.claude/` regenerate (pre-commit step 2 also enforces this).
10. `prompt-system/scripts/init-project-management.ps1` (idempotent scaffold writer) and
    `prompt-system/scripts/test-project-documentation.ps1`. Assertions: T-28 registered in the manifest; the new module
    in `loadOrder.conditional` and cited in `00-system.md` Load order; the four upstream templates carry `Artifact:`;
    no lowercase `config.md` / `roadmap-NNN` / `sprint-NNN` references remain in `adapters/opencode/commands/` or
    `.kilo/command/`; when `project-management/` exists it contains `CONFIG.md` and `README.md`. Add the suite to
    `$integritySuites` in `pre-commit.ps1` (gate 4).
11. Repo scaffold reconciliation: create `project-management/BACKLOG.md` (items RM-01..RM-06 with milestone, size, ICE,
    DoD -- sourced from `ROADMAP_2026_09.md` lines 15-20 and `SPRINT_001.md` lines 10-14, 36-41); create
    `project-management/EVALUATIONS.md` with header `# Session Evaluations` and no backfilled entries; rewrite
    `SPRINTS.md` as the index that points at `SPRINT_001.md`; extend the `project-management/README.md` structure table
    with `BACKLOG.md`, `EVALUATIONS.md`, `specs/SPEC.md`, `specs/TASKS.md`.
12. `CONFORMANCE.md` -- add rows: artifact gate; EVALUATIONS append; memory-worth close write; init idempotency and
    command-casing convergence.
13. `user-guide/PHASES.md` -- SPEC row path becomes `project-management/specs/SPEC.md`; add the artifact per upstream
    phase to the Phase Summary table; root-`SPEC.md` mentions removed.

## Out of scope

- CHECKLIST/DOCS/REVIEW/PLAN/PATCH gain no artifact files; their evidence chains are unchanged.
- No new phases, personas, rubrics, or anchors in the session-state allowlist.
- No root `SPEC.md`/`TASKS.md`/`EVALUATIONS.md` files are created or deleted; the canonical path is `project-management/`.
- `CHANGELOG.md` is generated from Conventional Commits -- not hand-edited.
- Past sessions are not backfilled into `EVALUATIONS.md`.

## Risks

- `test-phase-graph.ps1` parses transition edges: keep the artifact prerequisites as additions inside the existing edge
  lines, not new edge rows.
- `test-cross-reference-integrity.ps1` scans `user-guide/` and `project-management/` (`system-manifest.json`
  `scanDirs`): new files must not cite missing anchors.
- `test-decision-format.ps1` forbids `**A.**`-style variants across the corpus: use no decision blocks in new module
  text.
- `sync.ps1` mirrors `prompt-system/` and the synced root files into targets (MIR), so the new module and fixed commands
  deploy automatically; targets without `project-management/` get the lazy init at their first INTAKE -- verify on one
  target after deploy.
- Gate must stay inert where the pipeline is skipped (concrete target, greenfield) and READ_ONLY writes must never
  fabricate evidence: the SKIPPED-delivery rows are the record.

## Validation

Run from the repo root:

```powershell
pwsh -NoProfile -File prompt-system/scripts/test-project-documentation.ps1
pwsh -NoProfile -File prompt-system/scripts/test-manifest-io.ps1
pwsh -NoProfile -File prompt-system/scripts/test-cross-reference-integrity.ps1
pwsh -NoProfile -File prompt-system/scripts/test-phase-graph.ps1
pwsh -NoProfile -File prompt-system/scripts/test-registry-drift.ps1
pwsh -NoProfile -File prompt-system/scripts/test-decision-format.ps1
pwsh -NoProfile -File prompt-system/scripts/test-rubric-id-integrity.ps1
npx markdownlint-cli --config .markdownlint.jsonc <changed .md files>
pwsh -NoProfile -File generate-adapters.ps1
git status --short
```

Plan-Versus-Actual verify commands (one per landed change):

- `rg "T-28" prompt-system/11-triggers.md` -- expect pass
- `rg "15-project-documentation" prompt-system/00-system.md prompt-system/system-manifest.json` -- expect pass
- `rg "Artifact:" prompt-system/03-output-and-state.md` -- expect pass (4 occurrences)
- `rg -i "config\.md|roadmap-NNN|sprint-NNN" adapters/opencode/commands .kilo/command` -- expect fail (absence)
- `Test-Path project-management/BACKLOG.md, project-management/EVALUATIONS.md` -- expect pass

Playwright smoke: `SKIPPED: playwright-smoke -- no web-app entry point or UI-bearing edit (system/documentation change)`.
Mermaid validation: no new diagrams, so `scripts/test-mermaid.ps1 -StagedOnly` skips.

## Open questions

None blocking. Recommended defaults if they surface during execution: this governance session itself runs the gated
flow (its artifacts are the BACKLOG/SPRINTS/EVALUATIONS entries above), and the commit message follows the repo's
Conventional Commits style with a `docs(project-management):` scope.
