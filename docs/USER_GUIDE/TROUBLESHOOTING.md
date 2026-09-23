# 🔧 TROUBLESHOOTING

> 💡 **Common issues and fixes** — Quick reference for session problems.

---

## 🚨 Quick Diagnosis

| Symptom | Most Likely Cause | First Check |
|---|---|---|
| Agent ignores phases | `AGENTS.md` not at repo root | `ls AGENTS.md` |
| MCP tools missing | Env var not exported | `echo $EXA_API_KEY` |
| Immediate `BLOCKED` | Missing lib/version info | Agent searches manifests first |
| Trello absent | OAuth not completed | `opencode mcp auth trello` |
| Playwright fails | Node < 20 or browser missing | `node --version`, `npx playwright install` |
| Exa auth error | Wrong header key | Exa uses `x-api-key` |

---

## 📋 Common Issues

### MCP Servers

| Issue | Cause | Fix |
|---|---|---|
| Context7 not loading | Network / API down | Retry; fallback to direct docs |
| Playwright won't launch | Node version < 20 | Install Node 20+ |
| Playwright no browser | First run, browsers not installed | `npx playwright install chromium` |
| Exa missing | `EXA_API_KEY` not set | `echo $EXA_API_KEY` → add to `.env` → `source .env` |
| Trello tools absent | OAuth not done | `opencode mcp auth trello` → restart session |
| g-search fails | Playwright Chromium missing | `npx playwright install chromium` |

### Phase & Execution

| Issue | Cause | Fix |
|---|---|---|
| Agent starts wrong phase | `AGENTS.md` not read | Confirm at root; some agents need `--context AGENTS.md` |
| Stuck in `BLOCKED` | Prereq not met | Read `Reason` field; provide `Needed now` item |
| `FAILURE` emitted | Two protocol breaches | Reply `retry` to resume at last valid phase |
| DIRECT used for risky work | Agent misclassified | Use `/structured` to force |
| Phase header missing | Not in STRUCTURED mode | Use `/structured` or `/phase NAME` |

### Commit/Push Gate

| Issue | Cause | Fix |
|---|---|---|
| Ask not shown | No edits in session | `Edited Files` section empty → gate skipped |
| Push fails | Auth / network | Per-remote failures reported; not protocol failure |
| Remote URLs leaked | `git remote -v` unsanitized | Agent uses `git remote` (names only) + sanitizer |
| Force-push attempted | Manual git override | Never force-push; gate uses `git push <remote> <branch>` only |

### Session State

| Issue | Cause | Fix |
|---|---|---|
| Old approval restored | Session ID mismatch | Fresh session starts clean; legacy file = mismatch |
| State file missing | Read-only host | Conversation carrier used instead |
| `SESSION_STATE-*.md` not gitignored | `.gitignore` outdated | Add `SESSION_STATE-*.md` to `.gitignore` |

### File Operations

| Issue | Cause | Fix |
|---|---|---|
| Edit fails "oldString not found" | Whitespace/indent mismatch | Read file first; copy exact lines including indentation |
| Multiple matches for edit | String not unique | Provide more surrounding context or use `replaceAll` |
| Agent asks for file path | File not found by search | Agent searches first (`rg`); only asks if truly not on disk |

---

## 🔍 Debugging Commands

### Check MCP Status
```bash
# In agent session
"List available MCP tools"
```

### Verify Environment
```bash
# PowerShell
echo $EXA_API_KEY
node --version
pwsh --version
git --version
```

### Inspect Session State
```bash
# Find current session file
ls SESSION_STATE-*.md

# Read it
cat SESSION_STATE-<id>.md
```

### Check Git Status
```bash
git status
git diff
git log --oneline -5
```

### Verify Pre-commit
```bash
# Run manually
npx markdown-toc -i docs/USER_GUIDE/GETTING_STARTED.md
```

---

## 🆘 Escalation Path

1. **Read the error/block message** — It contains `Reason`, `Needed now`, `Next required user action`
2. **Search the codebase** — Agent uses `rg`; you can too: `rg "error pattern" src/`
3. **Check session state** — `SESSION_STATE-<id>.md` has phase, findings, approvals
4. **Review `AGENTS.md`** — Entry point for all rules
5. **Check `prompt-system/00-system.md`** — Orchestrator, hard guards, transitions
6. **Ask in DISCUSS** — `/discuss` or "let's talk about..." for exploration

---

## 📞 Platform-Specific

### OpenCode
| Issue | Fix |
|---|---|
| Config not loaded | Restart opencode after editing `opencode.jsonc` or `.opencode/` |
| MCP auth failed | `opencode mcp auth trello` → restart |
| Wrong env interp | Use `{env:VAR}` not `${VAR}` in `opencode.jsonc` |
| Persona not switching | `/baba <persona>` or switch agent in TUI |

### Claude Code
| Issue | Fix |
|---|---|
| MCP pending | Accept workspace trust dialog on first run |
| Settings not applied | Restart session after editing `.claude/` |
| Local overrides | Use `.claude/settings.local.json`, `CLAUDE.local.md` (gitignored) |

### Codex CLI
| Issue | Fix |
|---|---|
| Sandbox blocks write | `.codex/config.toml` → `workspace-write = true` |
| Approvals too strict | `approval-policy = "on-request"` |

---

## 📚 Related

- Phase flow: `USER_GUIDE/PHASES.md`
- Execution modes: `USER_GUIDE/EXECUTION_MODES.md`
- Getting started: `USER_GUIDE/GETTING_STARTED.md`
- System architecture: `REFERENCE/SYSTEM_OVERVIEW.md`
- MCP config: `AGENTS.md` (MCP Fallback Tiers section)
