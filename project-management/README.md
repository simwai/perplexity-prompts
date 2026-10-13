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
| `ROADMAP_YYYY_MM.md` | One roadmap per active period |
| [SPRINTS.md](SPRINTS.md) | Index of sprint plans |
| `SPRINT_NNN.md` | One sprint plan per sprint |
| [TRELLO_INTEGRATION.md](TRELLO_INTEGRATION.md) | Trello backend configuration |
| [FUTURE_ENHANCEMENTS.md](FUTURE_ENHANCEMENTS.md) | Deferred work and re-enablement conditions |

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
