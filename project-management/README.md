# Project Management

Source of truth for roadmaps and sprint plans.

## Backend

Configured in `config.md`. Default is `file` (local markdown files). When `backend: trello`, the Trello MCP server is used instead.

## Structure

- `config.md` — Backend selection and Trello board settings
- `roadmap-YYYY-MM.md` — Roadmap files (one per active roadmap)
- `sprint-NNN.md` — Sprint plan files (one per sprint)

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

Edit `config.md` and change `backend: file` to `backend: trello`. No data migration needed — files stay as archives, Trello becomes the active store.
