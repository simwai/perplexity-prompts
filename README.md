# perplexity-prompts

Adaptive prompt system with lightweight direct execution and a structured AI
code review workflow when the task needs it.

## Agent Instructions

This repository provides adaptive instructions for AI coding agents: direct
execution for clear low-risk work and a phase-gated workflow for tasks that
need stronger review and approval controls.

- [AGENTS.md](AGENTS.md): Agent instructions with Model Context Protocol (MCP) support for tools like Context7, Playwright, Trello, and Exa.

## Layout

```txt
AGENTS.md          The single entry file — paste at a target repo root.
system/            The copy-paste unit — contains bootstrap.txt (loader) and modules/.
docs/              Usage documentation.
opencode.jsonc     opencode-native config (optional layer, inert for other agents).
.opencode/         opencode persona agents and commands (optional layer).
CLAUDE.md          Claude Code memory that imports AGENTS.md (optional layer).
.mcp.json          Claude Code project MCP servers, tier 1 only (optional layer).
.claude/           Claude Code persona subagents and slash commands (optional layer).
.codex/            Codex CLI project config with safe defaults (optional layer).
```

## Deploy

Copy the system into a target project in two steps:

```powershell
Copy-Item -Recurse system <target-project>\system
```

Then paste `AGENTS.md` content as `AGENTS.md` at the target repo root.

For detailed instructions, see [docs/AGENTS-usage.md](docs/AGENTS-usage.md).

### Syncing multiple projects

Add project paths to `targets.json`, then run:

```powershell
.\sync.ps1 -All
```

Configured paths are included in the sync menu even before they contain
`AGENTS.md` and `system/`.

After syncing, each target that is a git repository gets the synced files
committed and pushed to its `origin` remote. Pass `-NoGitPush` (or toggle
`[G]` in the menu) to skip the commit/push step.

## Agent platform support

The core system (`AGENTS.md` + `system/`) is model-agnostic and works with any
agent. Optional adapter layers bind it to specific platforms; every other
agent ignores them:

- **opencode**: `opencode.jsonc` (MCP servers, bootstrap loader auto-load) and
  `.opencode/` (Baba personas as subagents, native Plan/Build overrides, and
  `/baba`, `/phase`, `/approve-plan`, `/handoff`, `/resume`, `/verify`
  commands).
- **Claude Code**: `CLAUDE.md` imports `AGENTS.md`; `.mcp.json` registers the
  tier-1 MCP servers; `.claude/agents/` provides the five Baba personas as
  subagents and `.claude/commands/` mirrors the Baba slash commands.
- **Codex CLI**: `.codex/config.toml` with safe defaults (workspace-write
  sandbox, on-request approvals) and tier-1 MCP servers.
- **Hermes**: no dedicated adapter – `AGENTS.md` + `system/` remain its
  integration surface. Revisit if Hermes gains project-config discovery.
