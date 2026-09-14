---
backend: file
---

# Project Management Config

## Backend Selection

- `file` — use `project-management/` folder as source of truth (default)
- `trello` — use Trello MCP as source of truth

## Trello Setup

When `backend: trello`, the following must be configured:
- Trello MCP OAuth consent completed via `opencode mcp auth trello`
- Board ID or board name specified in `board` field below

## Fields

- `board` (string, optional) — Trello board name or ID (used when backend is `trello`)
- `default_lists` (array) — Default list names when creating a new board
