# 🟡 CODEX CLI

> 💡 **Codex CLI native adapter** — Configuration for the Codex CLI agent.

---

## 📁 Files

| Path | Purpose |
|---|---|
| `.codex/config.toml` | Codex CLI project config with safe defaults (workspace-write sandbox, on-request approvals) and a generated tier-1 `[mcp_servers]` section |

---

## 🔧 Configuration

### Sandbox Settings
- `workspace-write = true` — allows writing to workspace
- `approval-policy = "on-request"` — requests approval before destructive operations

### MCP Servers
The `[mcp_servers]` section is generated from `opencode.jsonc` and includes tier-1 servers (Context7, Playwright, etc.).

---

## ⌨️ Commands

Codex CLI uses natural language commands rather than slash commands. The agent follows `AGENTS.md` + `prompt-system/` with prompt-enforced gates.

---

## 📚 Related

- OpenCode adapter: `PLATFORM_ADAPTERS/OPENCODE.md`
- Claude Code adapter: `PLATFORM_ADAPTERS/CLAUDE_CODE.md`
- Persona details: `USER_GUIDE/PERSONAS.md`
- Phase flow: `USER_GUIDE/PHASES.md`
- Execution modes: `USER_GUIDE/EXECUTION_MODES.md`
- Troubleshooting: `USER_GUIDE/TROUBLESHOOTING.md`
