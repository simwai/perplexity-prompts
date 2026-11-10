# Project Management

Source of truth for roadmaps and sprint plans.

## Backend

Configured in [CONFIG.md](CONFIG.md). Default is `file` (local markdown files). When `backend: trello`, the Trello MCP server is used instead. See [TRELLO_INTEGRATION.md](TRELLO_INTEGRATION.md) for the Trello setup.

## Structure

Files in this directory are `UPPER_SNAKE_CASE`, matching the repository naming rule in `prompt-system/10-doc-style.md`.

| File | Purpose |
|---|---|
| [CONFIG.md](CONFIG.md) | Backend selection and Trello board settings |
| [ROADMAPS.md](ROADMAPS.md) | Index of roadmaps |
| `ROADMAP_<YYYY-MM>.md` | One roadmap per active period |
| [BACKLOG.md](BACKLOG.md) | Milestone map and ICE-scored backlog items |
| [SPRINTS.md](SPRINTS.md) | Index of sprint plans |
| `SPRINT_<NNN>.md` | One sprint plan per sprint |
| `specs/SPEC.md` | Spec artifact (SPEC phase) |
| `specs/TASKS.md` | Task table (planning session) |
| [EVALUATIONS.md](EVALUATIONS.md) | Append-only session log (session close) |
| [TRELLO_INTEGRATION.md](TRELLO_INTEGRATION.md) | Trello backend configuration |
| [FUTURE_ENHANCEMENTS.md](FUTURE_ENHANCEMENTS.md) | Deferred work and re-enablement conditions |

## Phase-artifact gate

Every upstream phase writes its artifact into this scaffold before its transition fires (INTAKE the roadmap, BACKLOG the backlog file, SPRINT the sprint file, TASK_PLAN the task card, SPEC the spec artifact), per `prompt-system/15-project-documentation.md`. Files in this directory are source-of-truth documentation per `prompt-system/07-protocols.md` `## Artifact handling`: tracked, committed, never gitignored.

Note the filename casing: `CONFIG.md` is uppercase. A reference to `config.md` breaks on any case-sensitive filesystem.

## Commands

| Command | Purpose |
|---|---|
| `/create-roadmap` | Create a new roadmap |
| `/edit-roadmap` | Edit an existing roadmap |
| `/create-sprint-phase-plan` | Create a sprint plan from a roadmap |
| `/edit-sprint-phase-plan` | Edit an existing sprint plan |
| `/check-sprint-progress` | Report sprint progress |
| `/check-for-blockers` | Identify blockers across sprints |

## Switching Backends

Edit [CONFIG.md](CONFIG.md) and change `backend: file` to `backend: trello`. No data migration needed — files stay as archives, Trello becomes the active store.
