# 🔗 TRELLO INTEGRATION

> 💡 **Trello backend configuration** — Consolidated from `project-management/config.md` and `project-management/README.md`.

---

## 🎯 Backend Selection

The project management backend can be switched between local markdown files and Trello.

### Current Backend

**File** (default) — local markdown files in `project-management/`.

### Switching to Trello

Edit `project-management/config.md` and change `backend: file` to `backend: trello`. No data migration needed — files stay as archives, Trello becomes the active store.

---

## 📁 File Structure

| File | Purpose |
|---|---|
| `project-management/config.md` | Backend selection and Trello board settings |
| `project-management/roadmap-YYYY-MM.md` | Roadmap files (one per active roadmap) |
| `project-management/sprint-NNN.md` | Sprint plan files (one per sprint) |

---

## 🔧 Trello Setup

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

## 📚 Related

- Roadmaps: `PROJECT_MANAGEMENT/ROADMAPS.md`
- Sprints: `PROJECT_MANAGEMENT/SPRINTS.md`
- Project management overview: `project-management/README.md` (archived)