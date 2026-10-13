# TRELLO INTEGRATION

> **Trello backend configuration** — see [CONFIG.md](CONFIG.md) for the active backend setting.

---

## Backend Selection

The project management backend can be switched between local markdown files and Trello.

### Current Backend

**File** (default) — local markdown files in `project-management/`.

### Switching to Trello

Edit [CONFIG.md](CONFIG.md) and change `backend: file` to `backend: trello`. No data migration needed — files stay as archives, Trello becomes the active store.

---

## File Structure

| File | Purpose |
|---|---|
| [CONFIG.md](CONFIG.md) | Backend selection and Trello board settings |
| [ROADMAPS.md](ROADMAPS.md) | Roadmap index (`ROADMAP_YYYY_MM.md` per active period) |
| [SPRINTS.md](SPRINTS.md) | Sprint index (`SPRINT_NNN.md` per sprint) |

---

## Trello Setup

### Prerequisites

1. Run `opencode mcp auth trello` once
2. Restart the session
3. Trello tools appear after one-time OAuth consent

### Commands Using Trello

| Command | Purpose |
|---|---|
| `/check-for-blockers` | Scan all sprints for blocked or stalled items and report them with severity. Uses Trello MCP or the `project-management/` folder |
| `/check-sprint-progress` | Report story completion, task counts, and phase status across sprints. Uses Trello MCP or the `project-management/` folder |

---

## Related

- Roadmaps: [ROADMAPS.md](ROADMAPS.md)

- Sprints: [SPRINTS.md](SPRINTS.md)

- Backend config: [CONFIG.md](CONFIG.md)

- Overview: [README.md](README.md)
