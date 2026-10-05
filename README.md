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
| ⚡ 5-minute onboarding | `QUICKSTART.md` |
| 🎭 Which persona? | `user-guide/PERSONAS.md` |
| 🔄 Phase flow? | `user-guide/PHASES.md` |
| ⚙️ Execution modes? | `user-guide/EXECUTION_MODES.md` |
| 🔧 Troubleshooting? | `user-guide/TROUBLESHOOTING.md` |
| 🏗️ Architecture? | `ARCHITECTURE.md` |
| 📖 System overview? | `SYSTEM_OVERVIEW.md` |
| 📋 Rubrics? | `prompt-system/04-rubrics.md` |
| 🔵 Rules (H13-H38)? | `prompt-system/rules.md` |
| 🟢 Style defaults? | `prompt-system/05-impl-style.md` |
| 🟤 Protocols? | `prompt-system/07-protocols.md` |
| ⚫ PATCH protocol? | `prompt-system/06-misc.md` |
| ⚪ Plan-actual gate? | `prompt-system/08-plan-actual-gate.md` |
| 📋 Session state? | `prompt-system/03-output-and-state.md` |
| ✅ Conformance invariants? | `CONFORMANCE.md` |
| 📘 AGENTS.md usage? | `AGENTS_USAGE.md` |
| 🟢 OpenCode setup? | `user-guide/OPENCODE.md` |
| 📊 Roadmaps? | `project-management/ROADMAPS.md` |
| 📋 Sprints? | `project-management/SPRINTS.md` |
| 🔗 Trello? | `project-management/TRELLO_INTEGRATION.md` |
| 📖 Glossary? | `GLOSSARY.md` |

---

## 📐 Layout

```txt
AGENTS.md              The single entry file — paste at a target repo root
prompt-system/         The deployed unit — 14 top-level files (00-11 + rules.md) + stacks/ + scripts/
  stacks/              Per-language style sections (loaded on PATCH)
  scripts/             Integrity suites and reference-pool tooling
AGENTS_USAGE.md        How to use and deploy the system
ARCHITECTURE.md        Layer model, review path, portable vs adapter files
SYSTEM_OVERVIEW.md     File map and cross-references
CONFORMANCE.md         Protocol invariants verified before each phase transition
GLOSSARY.md            Central terminology reference
QUICKSTART.md          5-minute onboarding
user-guide/            Getting started, personas, phases, modes, troubleshooting
project-management/    Roadmaps, sprints, Trello integration
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

Only `AGENTS.md` plus `prompt-system/` is deployed to target projects. Everything
else above is repository documentation and stays local.

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

For detailed instructions, see `user-guide/GETTING_STARTED.md`.

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
