# 🟣 Baba Prompt System

> 💡 **Adaptive prompt system** with lightweight direct execution and a structured AI code review workflow when the task needs it.

---

## 🚀 Quick Start

```powershell
# 1. Copy the prompt-system folder
Copy-Item -Recurse prompt-system <target-project>\prompt-system

# 2. Paste AGENTS.md content as AGENTS.md at target repo root
```

Then describe a task and the agent handles the rest.

---

## 📚 Documentation

| Need | Go To |
|---|---|
| ⚡ 5-minute onboarding | `docs/QUICKSTART.md` |
| 🎭 Which persona? | `docs/user-guide/PERSONAS.md` |
| 🔄 Phase flow? | `docs/user-guide/PHASES.md` |
| ⚙️ Execution modes? | `docs/user-guide/EXECUTION_MODES.md` |
| 🔧 Troubleshooting? | `docs/user-guide/TROUBLESHOOTING.md` |
| 🏗️ Architecture? | `docs/refs/SYSTEM_OVERVIEW.md` |
| 📋 Rubrics? | `prompt-system/04-rubrics.md` |
| 🔵 Rules (H13-H38)? | `prompt-system/rules.md` |
| 🟢 Style defaults? | `docs/refs/IMPLEMENTATION_STYLE.md` |
| 🟤 Protocols? | `docs/refs/PROTOCOLS.md` |
| ⚫ PATCH protocol? | `docs/refs/PATCH_PROTOCOL.md` |
| ⚪ Plan-actual gate? | `docs/refs/PLAN_ACTUAL_GATE.md` |
| 📋 Session state? | `prompt-system/03-output-and-state.md` |
| 🟢 OpenCode setup? | `docs/user-guide/OPENCODE.md` |
| 📊 Roadmaps? | `docs/project-management/ROADMAPS.md` |
| 📋 Sprints? | `docs/project-management/SPRINTS.md` |
| 🔗 Trello? | `docs/project-management/TRELLO_INTEGRATION.md` |
| 📖 Glossary? | `docs/GLOSSARY.md` |

---

## 📐 Layout

```txt
AGENTS.md              The single entry file — paste at a target repo root
prompt-system/         The copy-paste unit — 14 top-level files (00-11 + rules.md) + stacks/ + scripts/
docs/                  Usage documentation (UPPER_SNAKE_CASE files, kebab-case dirs)
  QUICKSTART.md        5-minute onboarding
  GLOSSARY.md          Central terminology reference
  user-guide/          Getting started, personas, phases, modes, troubleshooting
  refs/           Canonical system references (mirrors prompt-system/)
  project-management/  Roadmaps, sprints, Trello integration
adapters/              Adapter templates (source of truth for generated files)
  claude/agents/       Claude Code subagent templates
  claude/skills/       Claude Code slash-command skill templates
  claude/settings.json Claude Code project settings template
  opencode/agents/     OpenCode agent templates
  opencode/commands/   OpenCode command templates
opencode.jsonc         opencode-native config (optional layer, inert for other agents)
.opencode/             Generated OpenCode adapters (agents + commands)
.claude/               Generated Claude Code adapters (agents + skills + settings)
.mcp.json              Generated MCP server config (shared by both platforms)
sync.ps1               Interactive propagation to target projects
generate-adapters.ps1  Generates .opencode/ and .claude/ from adapters/
```

---

## 🎨 Visual Theme

This documentation uses **dark + purple** styling:

- Mermaid diagrams with dark theme and purple-500 accents
- Emoji/color hints for GitHub/VS Code dark mode
- CSS variables for HTML export (if generating a site)

---

## 🔐 Prerequisites

| Tool | Minimum Version | Purpose |
|---|---|---|
| Node.js | 20+ | MCP servers (npx), Playwright |
| PowerShell | 7.6+ (pwsh) | Scripts, git ops |
| Git | 2.30+ | Version control, commit/push gate |

---

## 📦 Deploy

Copy the system into a target project in two steps:

```powershell
Copy-Item -Recurse prompt-system <target-project>\prompt-system
```

Then paste `AGENTS.md` content as `AGENTS.md` at the target repo root.

For detailed instructions, see `docs/user-guide/GETTING_STARTED.md`.

### Syncing Multiple Projects

Add project paths to `targets.json`, then run:

```powershell
.\sync.ps1 -All
```

Configured paths are included in the sync menu even before they contain
`AGENTS.md` and `prompt-system/`.

After syncing, each target that is a git repository gets the synced files
committed and pushed to its `origin` remote. Pass `-NoGitPush` (or toggle
`[G]` in the menu) to skip the commit/push step.

---

## 📖 Changelog

See `CHANGELOG.md` for the full version history.

---

> 📝 **Note**: This README is the navigation hub. For the canonical system files, see `prompt-system/`.
