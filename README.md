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
prompt-system/     The copy-paste unit — 8 system files (00-08).
docs/              Usage documentation.
opencode.jsonc     opencode-native config (optional layer, inert for other agents).
.opencode/         opencode persona agents and commands (optional layer).
CLAUDE.md          Claude Code memory that imports AGENTS.md (optional layer).
.mcp.json          Claude Code project MCP servers, tier 1 only (generated).
.claude/           Claude Code persona subagents and slash commands (generated).
.codex/            Codex CLI project config with safe defaults (MCP section generated).
sync.ps1           Interactive propagation to target projects (runs the generator).
generate-adapters.ps1
                   Emits .claude/** and MCP blocks from .opencode/** + opencode.jsonc.
```

## Deploy

Copy the system into a target project in two steps:

```powershell
Copy-Item -Recurse prompt-system <target-project>\prompt-system
```

Then paste `AGENTS.md` content as `AGENTS.md` at the target repo root.

For detailed instructions, see [docs/AGENTS-usage.md](docs/AGENTS-usage.md).

### Syncing multiple projects

Add project paths to `targets.json`, then run:

```powershell
.\sync.ps1 -All
```

Configured paths are included in the sync menu even before they contain
`AGENTS.md` and `prompt-system/`.

After syncing, each target that is a git repository gets the synced files
committed and pushed to its `origin` remote. Pass `-NoGitPush` (or toggle
`[G]` in the menu) to skip the commit/push step.

## Agent platform support

The core system (`AGENTS.md` + `prompt-system/`) is model-agnostic and works with any
agent. Optional adapter layers bind it to specific platforms; every other
agent ignores them:

- **opencode**: `opencode.jsonc` (MCP servers, bootstrap loader auto-load) and
  `.opencode/` (Baba personas as subagents, native Plan/Build overrides, and
  `/baba`, `/phase`, `/approve-plan`, `/handoff`, `/resume`, `/verify`,
  `/auto`, `/direct`, `/structured`, `/review-consolidated`,
  `/review-interactive`, `/check-for-blockers`, `/check-sprint-progress`,
  `/create-roadmap`, `/edit-roadmap`, `/create-sprint-phase-plan`,
  `/edit-sprint-phase-plan`, `/code-ref` commands). This is the canonical
  authoring surface.
- **Claude Code**: `CLAUDE.md` imports `AGENTS.md`; `.mcp.json` registers the
  tier-1 MCP servers; `.claude/agents/` provides the five Baba personas as
  subagents and `.claude/commands/` mirrors the Baba slash commands. All of
  these are **generated** by `generate-adapters.ps1` from `.opencode/` and
  `opencode.jsonc` – edit the sources, never the generated files.
- **Codex CLI**: `.codex/config.toml` with safe defaults (workspace-write
  sandbox, on-request approvals) and a generated tier-1 `[mcp_servers]`
  section.
- **Hermes**: no dedicated adapter – `AGENTS.md` + `prompt-system/` remain its
  integration surface. Revisit if Hermes gains project-config discovery.

## opencode Commands

| Command | Purpose |
|---|---|
| `/baba <persona>` | Activate a Baba persona (`scrummaster`, `sensei`, `dev`, `tester`, `reviewer`) and start the phase flow. |
| `/phase <NAME>` | Declare the active structured phase (`CHECKLIST`, `DOCS`, `REVIEW`, `PLAN`, `PATCH`, `DISCUSS`, `DRIFT`, `BLOCKED`, `FAILURE`, plus optional upstream `INTAKE`, `BACKLOG`, `SPRINT`, `TASK_PLAN`, `SPEC`). |
| `/approve-plan` | Persist plan approval + rewrite contract into the session's own state file (`SESSION_STATE-<session_id>.md`). |
| `/handoff` | Emit the persona handoff contract and persist it to the session state file. |
| `/resume` | Restore the prior phase from the session's own state file after `DISCUSS` or interruption. |
| `/verify` | Inspect the diff and run relevant project checks; apply the commit/push gate when edits were made. |
| `/auto` | Switch execution mode to `AUTO` — agent chooses direct or structured by task risk. |
| `/direct` | Switch execution mode to `DIRECT` — clear low-risk work without phase templates. |
| `/structured` | Switch execution mode to `STRUCTURED` — full phase-gated workflow. |
| `/review-consolidated` | Set `review_mode = consolidated` and enter `REVIEW` phase. Aggregates all findings into one final decision block. |
| `/review-interactive` | Set `review_mode = interactive` and enter `REVIEW` phase. Emits one batch per response and waits for confirmation. |
| `/check-for-blockers` | Scan all sprints for blocked or stalled items and report them with severity. Uses Trello MCP or the `project-management/` folder. |
| `/check-sprint-progress` | Report story completion, task counts, and phase status across sprints. Uses Trello MCP or the `project-management/` folder. |
| `/create-roadmap` | Create a new roadmap document. |
| `/edit-roadmap` | Edit an existing roadmap document. |
| `/create-sprint-phase-plan` | Create a new sprint phase plan. |
| `/edit-sprint-phase-plan` | Edit an existing sprint phase plan. |
| `/code-ref` | Look up a high-quality code reference from the curated global pool. Flags: `--language`, `--domain`, `--keywords`, `--pool`, `--refresh`. |
| `/reddit-post` | Draft a high-engagement Reddit post by researching top-performing posts in the best subreddits for the project. Optional argument: `[subreddit-override]`. |
| `/arxiv-paper` | Generate a full arXiv-ready paper PDF for the current project, using either a provided reference arXiv paper or auto-discovered high-cited readable papers. Optional argument: `[arxiv-id-or-url]`. |

Nothing is maintained twice: personas, commands, and MCP server definitions
live once (in `.opencode/` and `opencode.jsonc`), and `sync.ps1` regenerates
every adapter mirror before propagating.
