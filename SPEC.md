---
status: frozen
version: 0.1.0
frozen_at: 2026-09-30T14:30:00Z
---

## Overview

Complete rewrite of the prompt-system to be spec-first, removing session state files and session locks, deduplicating rules, splitting stack-specific guidance, and establishing a four-session workflow (spec → spec-review → planning → build) with `/close` evaluation logging.

## Scope (in / out)

**In:**

- Cut: session locks, session state files, duplicated decision format, fresh-session load mandate duplicates, smallest-request rule duplicate, CHECKLIST rubric enumeration, handoff contract bloat, SPEC-writes-through-PATCH rule
- Split: `05-impl-style.md` into core + 4 stack files + design guidelines + doc style
- Trim: `07-protocols.md` to keep only artifact handling, prompt-system protection, pre-commit
- Cleanup: `06-misc.md` markers, leftover handling, cross-cutting protocol reference to `07-protocols.md` (remove duplicate section), Plan-Versus-Actual persistence
- Remove: static file lists, embedded directory trees, stale "merged from" history
- Reassign: BabaSensei → spec author, BabaReviewer → code + spec review, BabaScrumMaster unchanged, BabaDev unchanged
- Build: spec workflow (spec session, spec review, planning, build, `/close`)
- Enforcement: prompt-level rules only, no runtime enforcement

**Out of scope:**

- Adding PLAN_REVIEW phase with P-tier rubrics
- Adding more PATCH gates
- Adding session state sections
- Keeping "All SPECS/ writes flow through PATCH"
- Merging into AGENTS.md
- Deleting Reading Protocol or Discovery Protocol (keep both, strip state persistence only)
- Preserving `system_evidence` or `reading_plan` in any schema
- Cutting `05-impl-style.md` (stack sections stay, split by language)
- Loading all stack files in one session
- Restating file lists in more than one place
- Embedding directory trees in prompt files
- Referencing specific section names across files
- Including handoff fields requiring cross-session memory
- Adding pre-session or runtime enforcement scripts
- Writing enforcement rules depending on agent filesystem inspection at startup
- Creating one evaluation file per session (single `docs/EVALUATIONS.md` appended)
- Adding pre-session or runtime enforcement scripts

## Out of scope (explicit from brief)

See "Do not" section in the brief - all items there are explicitly out of scope.

## Interfaces

- `SPEC.md` at repo root (frontmatter: status, version, frozen_at)
- `TASKS.md` at repo root (markdown table with task id, spec ref, LOC bound, acceptance, done checkbox)
- `docs/EVALUATIONS.md` at repo root (append-only session log)
- Prompt-system files: `00-system.md`, `01-personas.md`, `02-decision-prompts.md`, `03-output-and-state.md`, `04-rubrics.md`, `04b-rubrics-logical.md`, `05-impl-style.md`, `06-misc.md`, `07-protocols.md`, `08-plan-actual-gate.md`, `09-design-guidelines.md`, `10-doc-style.md`, `prompt-system/stacks/STACK-typescript.md`, `prompt-system/stacks/STACK-python.md`, `prompt-system/stacks/STACK-java.md`, `prompt-system/stacks/STACK-frontend.md`, `prompt-system/stacks/STACK-powershell.md`, `prompt-system/stacks/STACK-pinescript.md`, `prompt-system/stacks/STACK-database.md`
- Load order in `00-system.md` annotated with scope: `[core]`, `[review]`, `[on-demand]`, `[stack]`, `[designer]`, `[doc]`
- **05-impl-style.md split mapping:**

  | Source Section | Target File |
  |----------------|-------------|
  | General principles, greenfield rules, local-convention policy, error-idiom consistency, design heuristics, code-decision ladder, minimal verification floor, project structure, comments, markdown defaults, naming, file naming, file separation, security defaults, logging defaults, command-line defaults, testing coordination, style floor | `05-impl-style.md` (core, always-load) |
  | Design Guidelines | `09-design-guidelines.md` (load when BabaDesigner active) |
  | Documentation Style | `10-doc-style.md` (load on `.md` edits) |
  | Stack: TypeScript/JavaScript | `prompt-system/stacks/STACK-typescript.md` |
  | Stack: Python | `prompt-system/stacks/STACK-python.md` |
  | Stack: Java | `prompt-system/stacks/STACK-java.md` |
  | Stack: Frontend | `prompt-system/stacks/STACK-frontend.md` |
  | Stack: PowerShell | `prompt-system/stacks/STACK-powershell.md` |
  | Stack: Pine Script | `prompt-system/stacks/STACK-pinescript.md` |
  | Stack: Database | `prompt-system/stacks/STACK-database.md` |

- Phase templates in `03-output-and-state.md` updated for new workflow

## Data

- SPEC.md frontmatter: `status` (draft|frozen), `version` (semver), `frozen_at` (ISO timestamp)
- TASKS.md rows: `#`, `Task`, `Spec §`, `≤LOC`, `Acceptance`, `Done`
- EVALUATIONS.md entries: timestamp, session type, task, files changed, verification results, outcome, notes

## Security

- No credentials in prompt files
- No secret reading in spec/plan/build sessions
- Credential sanitization rules remain (H1, H7 from 04-rubrics.md)

## Failure modes

- Spec review fails to converge (infinite loop) → bounded by "no material edits" convergence check
- Build session exceeds 500 LOC → stop and report, don't invent
- Task unsizable from frozen spec → spec bug, stop planning, don't invent
- Agent bypasses spec pipeline → prompt-level BLOCKED rules in 00-system.md (weakest enforcement)
- Pre-existing working tree changes pollute commit → stage only session's edited files (commit/push gate)

## Open questions

1. **RESOLVED (A)**: Load-scope annotations use formal enum: `[core]`, `[review]`, `[on-demand]`, `[stack]`, `[designer]`, `[doc]` (exact values, case-sensitive).
2. **RESOLVED**: Keep `system_evidence` as temporary artifact (populated by Discovery Protocol during CHECKLIST, discarded after REVIEW). H14-H40 keep their `system_evidence` triggers.
3. **RESOLVED (A)**: No dependency field — tasks ordered in TASKS.md, "first unchecked" executes; spec author orders correctly.
4. **RESOLVED (A)**: Keep `08-plan-actual-gate.md` separate, added to 00-system.md Load order with `[review]` scope.
5. **RESOLVED (A + C)**: STYLE_POLICY.md auto-trigger fires first in spec session (BabaSensei asks during spec authoring if project has AGENTS.md but no STYLE_POLICY.md; recorded in SPEC.md). Fallback: planning session asks if missed.
6. **RESOLVED (C)**: BabaSensei writes draft SPEC.md when it has answers for all template sections (Overview, Scope, Interfaces, Data, Security, Failure modes, Open questions, Task list).
7. **RESOLVED (A)**: Material edit = any change to scope (in/out), interfaces, data models, security requirements, failure modes, task list structure. Wording/typos/formatting are non-material by definition.

## Task list

Per Part 5 execution order:

1. **Part 1 cuts** (deduplication, removals)
   - 1.1 Remove session locks
   - 1.2 Remove session state files entirely
   - 1.3 Deduplicate decision format
   - 1.4 Deduplicate fresh-session load mandate
   - 1.5 Deduplicate smallest-request rule
   - 1.6 Collapse CHECKLIST rubric enumeration
   - 1.7 Simplify handoff contract
   - 1.8 Fix `04-rubrics.md` (header S1-S25, rules.md refs → docs/REFERENCE/RULES.md, over-engineering collapse H20/H25/H26/S13 into one rule with sub-checks, L1-L10 detailed rubrics moved verbatim to `04b-rubrics-logical.md`; `04-rubrics.md` keeps one-line pointer); `04b-rubrics-logical.md` created with L1-L10 detailed rubrics copied verbatim from current 04-rubrics.md
   - 1.9 Remove SPEC-writes-through-PATCH rule
   - 1.10 Split `05-impl-style.md` into 8 files: core (`05-impl-style.md`), design (`09-design-guidelines.md`), doc style (`10-doc-style.md`), 7 stack files (`prompt-system/stacks/STACK-*.md`)
   - 1.11 Keep Reading Protocol; strip state persistence
   - 1.12 Keep Discovery Protocol; strip state persistence
   - 1.13 Trim `07-protocols.md` (keep: Artifact handling, Prompt-system protection, Pre-commit behavior; collapse .gitignore/.gitattributes authoring to 3-4 lines each; remove session file locks, spec lifecycle, drift detection, discuss mode, scrum planning from intro; collapse pre-commit from ~120 to ~40 lines: keep Husky/Node, pre-commit/Python, no CI pipelines, REVIEW flags, format-before-lint)
   - 1.14 Cleanup `06-misc.md` (delete four `!!!` markers at PATCH protocol, Verification gate, Commit/push gate, Leftover Handling; delete `<HIGH_PRIO>!!!` blocks duplicating section headers; delete duplicate "## Cross-cutting protocol" section at bottom; strip `<MUST>`/`<MUST_NOT>` tags; replace Leftover Handling with: "Before commit gate, delete repo-local temp files not in PATCH edited-file set. OS temp dir exempt.")
   - 1.15 Keep Plan-Versus-Actual, drop persistence
   - 1.16 Keep rest of `06-misc.md`
   - 1.17 Remove static file lists, stale trees, embedded directory structures (enumerate all targets: fenced `├──`/`└──` trees in 10-doc-style.md docs/ tree; file lists asserting existence in 00, 01, 02, 03, 05, 06, 07; load-order restatements outside 00; "Additional loads:" patterns; "merged from N files" history; after §1.10 split, update references to point at new files; only 00 Load order survives, annotated with scope)
   - 1.18 Execution order: stack split + 07 trim before static-list pass

2. **Part 2 reassign personas**
    - 2.1 BabaSensei → spec author (SPEC → HANDOFF to BabaReviewer); default route: goal → BabaSensei spec session; explicit "use scrum" → BabaScrumMaster pipeline
    - 2.2 BabaReviewer → code review + spec review
    - 2.3 BabaScrumMaster unchanged
    - 2.4 BabaDev unchanged, entry point reads SPEC.md + TASKS.md

3. **Part 3 spec workflow**
   - 3.1 Spec session (BabaSensei/BabaScrumMaster) → SPEC.md
   - 3.2 Spec review session (BabaReviewer) → frozen SPEC.md
   - 3.3 Planning session → TASKS.md (table columns: #, Task, Spec § (by section id, e.g., "1.10"), ≤LOC, Acceptance, Done; tasks ordered, unique id, spec-section reference, ≤500 LOC, one-line acceptance; if task unsizable → spec bug, stop; no dependency field — tasks assumed independent)
   - 3.4 Build session (BabaDev) → one task
   - 3.5 `/close` command → docs/EVALUATIONS.md (implemented as prompt instruction: user types `/close`, agent appends entry to docs/EVALUATIONS.md; if file missing, create with header "# Session Evaluations"; entry format: timestamp, session type, task, files changed, verification, outcome, notes)

4. **Part 4 enforcement**
   - Prompt-level rules in 00-system.md (BLOCKED if: no SPEC.md present; status:draft → only spec/spec-review phases; status:frozen → planning allowed; frozen spec + tasks file → build allowed; build session: one task, no planning, no spec writes)
   - Tool-level injection, human-in-the-loop, prompt-level (weakest)
   - Delete runtime enforcement sections

5. **Part 5 order of work** (as above); **Migration**: old `SPECS/NNN-name/spec.md` files archived to `docs/ARCHIVED_SPECS/`; root SPEC.md is new single source of truth
