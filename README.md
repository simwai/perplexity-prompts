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
| 🎭 Which persona? | `docs/USER_GUIDE/PERSONAS.md` |
| 🔄 Phase flow? | `docs/USER_GUIDE/PHASES.md` |
| ⚙️ Execution modes? | `docs/USER_GUIDE/EXECUTION_MODES.md` |
| 🔧 Troubleshooting? | `docs/USER_GUIDE/TROUBLESHOOTING.md` |
| 🏗️ Architecture? | `docs/REFERENCE/SYSTEM_OVERVIEW.md` |
| 📋 Rubrics? | `docs/REFERENCE/RUBRICS.md` |
| 🔵 Rules (H13-H40)? | `docs/REFERENCE/RULES.md` |
| 🟢 Style defaults? | `docs/REFERENCE/IMPLEMENTATION_STYLE.md` |
| 🟤 Protocols? | `docs/REFERENCE/PROTOCOLS.md` |
| ⚫ PATCH protocol? | `docs/REFERENCE/PATCH_PROTOCOL.md` |
| ⚪ Plan-actual gate? | `docs/REFERENCE/PLAN_ACTUAL_GATE.md` |
| 📋 Session state? | `docs/REFERENCE/SESSION_STATE.md` |
| 🟢 OpenCode setup? | `docs/PLATFORM_ADAPTERS/OPENCODE.md` |
| 🔵 Claude Code setup? | `docs/PLATFORM_ADAPTERS/CLAUDE_CODE.md` |
| 🟡 Codex CLI setup? | `docs/PLATFORM_ADAPTERS/CODEX_CLI.md` |
| 📊 Roadmaps? | `docs/PROJECT_MANAGEMENT/ROADMAPS.md` |
| 📋 Sprints? | `docs/PROJECT_MANAGEMENT/SPRINTS.md` |
| 🔗 Trello? | `docs/PROJECT_MANAGEMENT/TRELLO_INTEGRATION.md` |
| 📖 Glossary? | `docs/GLOSSARY.md` |

---

## 📐 Layout

```txt
AGENTS.md              The single entry file — paste at a target repo root
prompt-system/         The copy-paste unit — 9 system files (00-08 + rules)
docs/                  Usage documentation (SNAKE_UPPER_CASE structure)
  QUICKSTART.md        5-minute onboarding
  GLOSSARY.md          Central terminology reference
  USER_GUIDE/          Getting started, personas, phases, modes, troubleshooting
  REFERENCE/           Canonical system references (mirrors prompt-system/)
  PLATFORM_ADAPTERS/   OpenCode, Claude Code, Codex CLI setup
  PROJECT_MANAGEMENT/  Roadmaps, sprints, Trello integration
opencode.jsonc         opencode-native config (optional layer, inert for other agents)
.opencode/             opencode persona agents and commands (optional layer)
CLAUDE.md              Claude Code memory that imports AGENTS.md (optional layer)
.mcp.json              Claude Code project MCP servers, tier 1 only (generated)
.claude/               Claude Code persona subagents and slash commands (generated)
.codex/                Codex CLI project config with safe defaults (MCP section generated)
sync.ps1               Interactive propagation to target projects (runs the generator)
generate-adapters.ps1  Emits .claude/** and MCP blocks from .opencode/** + opencode.jsonc
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
| PowerShell | 7.6+ (pwsh) | Scripts, session locks, git ops |
| Git | 2.30+ | Version control, commit/push gate |

---

## 📦 Deploy

Copy the system into a target project in two steps:

```powershell
Copy-Item -Recurse prompt-system <target-project>\prompt-system
```

Then paste `AGENTS.md` content as `AGENTS.md` at the target repo root.

For detailed instructions, see `docs/USER_GUIDE/GETTING_STARTED.md`.

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