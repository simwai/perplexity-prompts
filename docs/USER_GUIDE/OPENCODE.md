# 🟢 OPENCODE

> 💡 **OpenCode native adapter** — Configuration, personas, and commands for the OpenCode agent.

---

## 📁 Files

| Path | Purpose |
|---|---|
| `opencode.jsonc` | opencode config: auto-loads `AGENTS.md` + system files via `instructions`, sets BabaSensei as default agent, registers version-pinned MCP servers |
| `.opencode/agents/baba-*.md` | The five personas as OpenCode subagents. Read-only personas deny `edit` and `bash`; BabaDev alone can edit and run commands |
| `.opencode/agents/plan.md` | Overrides native OpenCode Plan with BabaSensei rules (read-only) |
| `.opencode/agents/build.md` | Overrides native OpenCode Build with BabaDev rules (requires approved plan + rewrite contract) |
| `.opencode/commands/baba.md` | `/baba <persona>` — activates a persona and starts the phase flow |
| `.opencode/commands/phase.md` | `/phase <NAME>` — declares the active phase and enforces its template |
| `.opencode/commands/approve-plan.md` | `/approve-plan` — persists plan approval + rewrite contract into the session state file |
| `.opencode/commands/handoff.md` | `/handoff` — emits the persona handoff contract |
| `.opencode/commands/resume.md` | `/resume` — restores prior phase from the session state file |
| `.opencode/commands/verify.md` | `/verify` — inspects diff and runs relevant project checks |

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
| `/close` | Close the session |
| `/consensus` | Toggle multi-model consensus |
| `/feedback` | Give feedback on output quality |
| `/feedback-status` | Check feedback status |
| `/kickoff` | Start a new session with goal intake |
| `/check-for-blockers` | Scan all sprints for blocked or stalled items and report them with severity |
| `/check-sprint-progress` | Report story completion, task counts, and phase status across sprints |
| `/create-roadmap` | Create a new roadmap document |
| `/edit-roadmap` | Edit an existing roadmap document |
| `/create-sprint-phase-plan` | Create a new sprint phase plan |
| `/edit-sprint-phase-plan` | Edit an existing sprint phase plan |
| `/code-ref` | Look up a high-quality code reference from the curated global pool |
| `/reddit-post` | Draft a high-engagement Reddit post |
| `/arxiv-paper` | Generate a full arXiv-ready paper PDF |

---

## 🔧 Configuration Notes

### Restart After Changes
opencode loads config once at startup. After editing `opencode.jsonc`, `.opencode/agents/*`, or `.opencode/commands/*`, quit and restart opencode.

### Env Interpolation
opencode uses `{env:VAR}`, not `${VAR}`. The `exa` server header is `{env:EXA_API_KEY}`; remove the `exa` entry if the key is absent.

### Trello OAuth
Run `opencode mcp auth trello` once, then restart the session.

### Native Plan → Build
Tab to Plan for review/planning; approve with `/approve-plan` (or explicit approval); switch to Build for PATCH. Build refuses to patch without approved plan state in the session state file.

### Switching Persona
Switch the agent in the TUI, or run `/baba <persona>`. The personas are defined in `prompt-system/01-personas.md`; agent files reference that file and do not duplicate the content.

### Perplexity / Other Agents
Ignore `opencode.jsonc` and `.opencode/`. They still follow `AGENTS.md` + `prompt-system/` with prompt-enforced gates.

---

## 📚 Related

- Persona details: `USER_GUIDE/PERSONAS.md`
- Phase flow: `USER_GUIDE/PHASES.md`
- Execution modes: `USER_GUIDE/EXECUTION_MODES.md`
- Troubleshooting: `USER_GUIDE/TROUBLESHOOTING.md`
