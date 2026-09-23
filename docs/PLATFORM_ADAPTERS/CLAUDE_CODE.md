# 🔵 CLAUDE CODE

> 💡 **Claude Code native adapter** — Configuration, personas, and commands for Claude Code.

---

## 📁 Files

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Claude Code memory file that imports `AGENTS.md` via `@AGENTS.md` – both tools read the same instructions without duplication |
| `.mcp.json` | Project-scope MCP servers, tier 1 only (Context7 HTTP, Playwright pinned). Generated from `opencode.jsonc`. Committed so every teammate gets the same tools |
| `.claude/settings.json` | Shared project settings: credential-file read denies (`.env`, `.env.*`, `secrets/`, `*.key`, `*.pem`), plus pre-approval of the two keyless MCP servers. Hand-maintained (settings have no source elsewhere) |
| `.claude/agents/baba-*.md` | The five Baba personas as Claude Code subagents. Generated from `.opencode/agents/baba-*.md`. Read-only personas list safe tools only; BabaDev inherits all tools |
| `.claude/commands/*.md` | Mirrors of the Baba slash commands. Generated from `.opencode/commands/*.md` |

---

## ⌨️ Commands

| Command | Purpose |
|---|---|
| `/baba <persona>` | Activate a Baba persona (`scrummaster`, `sensei`, `dev`, `tester`, `reviewer`) and start the phase flow |
| `/phase <NAME>` | Declare the active structured phase |
| `/approve-plan` | Persist plan approval + rewrite contract into the session state file |
| `/handoff` | Emit the persona handoff contract and persist it to the session state file |
| `/resume` | Restore the prior phase from the session state file after DISCUSS or interruption |
| `/verify` | Inspect the diff and run relevant project checks; apply the commit/push gate when edits were made |
| `/auto` | Switch execution mode to AUTO — agent chooses direct or structured by task risk |
| `/direct` | Switch execution mode to DIRECT — clear low-risk work without phase templates |
| `/structured` | Switch execution mode to STRUCTURED — full phase-gated workflow |
| `/review-consolidated` | Set `review_mode = consolidated` and enter REVIEW phase |
| `/review-interactive` | Set `review_mode = interactive` and enter REVIEW phase |
| `/check-for-blockers` | Scan all sprints for blocked or stalled items and report them with severity |
| `/check-sprint-progress` | Report story completion, task counts, and phase status across sprints |
| `/create-roadmap` | Create a new roadmap |
| `/edit-roadmap` | Edit an existing roadmap |
| `/create-sprint-phase-plan` | Create a new sprint phase plan |
| `/edit-sprint-phase-plan` | Edit an existing sprint phase plan |
| `/code-ref` | Look up a high-quality code reference from the curated global pool |

---

## 🔧 Configuration Notes

### Single Source of Truth
Edit `.opencode/agents/`, `.opencode/commands/`, and the `opencode.jsonc` `mcp` block – then run `.\generate-adapters.ps1`. Files under `.claude/` carry a GENERATED banner; direct edits are lost on the next run. `sync.ps1` regenerates automatically before propagating.

### Workspace Trust
On first run in a cloned repo, accept the trust dialog – MCP approvals from committed settings apply only in trusted folders.

### Local Overrides
`.claude/settings.local.json` and `CLAUDE.local.md` are gitignored; create them by hand for personal, non-shared settings.

### Restart After Changes
Restart the session after editing files under `.claude/agents/` or `.claude/commands/` for the changes to load.

### Single Source of Truth (Personas)
Persona definitions in `prompt-system/01-personas.md` remain canonical – subagent and command files reference them, never duplicate.

### Perplexity / Other Agents
Ignore `CLAUDE.md`, `.mcp.json`, `.claude/`, `.codex/`, `opencode.jsonc`, and `.opencode/`. They still follow `AGENTS.md` + `prompt-system/` with prompt-enforced gates.

---

## 📚 Related

- OpenCode adapter: `PLATFORM_ADAPTERS/OPENCODE.md`
- Codex CLI adapter: `PLATFORM_ADAPTERS/CODEX_CLI.md`
- Persona details: `USER_GUIDE/PERSONAS.md`
- Phase flow: `USER_GUIDE/PHASES.md`
- Execution modes: `USER_GUIDE/EXECUTION_MODES.md`
- Troubleshooting: `USER_GUIDE/TROUBLESHOOTING.md`