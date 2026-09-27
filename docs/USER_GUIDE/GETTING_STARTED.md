# 🚀 GETTING STARTED

> 💡 **Deploy, prerequisites, first session** — Complete setup guide.

---

## 📦 Deployment

### Copy-Paste Unit

The portable deployment unit is **`AGENTS.md` + `prompt-system/`**:

```powershell
# 1. Copy prompt-system folder
Copy-Item -Recurse prompt-system <target-project>\prompt-system

# 2. Create AGENTS.md at target repo root
# Copy contents of this repo's AGENTS.md to target/AGENTS.md
```

### Multi-Project Sync

For syncing multiple projects, copy `targets.json.example` to `targets.json`, edit with your project paths, then run:

```powershell
# First-time setup
Copy-Item targets.json.example targets.json
# Edit targets.json with your project paths (absolute paths)
# Run sync
.\sync.ps1 -All
```

- `targets.json` is **gitignored** — machine-specific paths, never committed
- `targets.json.example` is committed as a template — copy and customize
- Configured paths appear in sync menu even before they contain `AGENTS.md`/`prompt-system/`
- Each git repo gets synced files committed + pushed to `origin`
- Use `-NoGitPush` or toggle `[G]` to skip commit/push
- Use `-DeleteLegacy` to remove old `.claude/`, `.cursor/`, `.codex/`, `test/`, `BOOTSTRAP.md` files and other legacy artifacts (`system/`, `synced-scripts/`, `agent-resources/`, `CLAUDE.md`)

**Sync options:**
| Flag | Purpose |
|---|---|
| `-All` | Sync all configured targets non-interactively |
| `-DryRun` | Preview what would be copied without making changes |
| `-NoGitPush` | Commit locally but skip push to remotes |
| `-DeleteLegacy` | Remove legacy folders (`.claude/`, `.cursor/`, `.codex/`, `test/`, `system/`, `synced-scripts/`, `agent-resources/`, `CLAUDE.md`, `BOOTSTRAP.md`) |

> **Note:** The `.opencode/` folder is synced from source, but **test folders are NOT part of the source** (they're local development artifacts). Any existing `test/` folders in target projects are considered legacy and will be removed with `-DeleteLegacy`. **BOOTSTRAP.md is also removed** as it's superseded by the `prompt-system/` deployment. The sync only copies: `prompt-system/`, `.opencode/` (without tests), `.opencode/agents/`, and core files (`AGENTS.md`, `opencode.jsonc`, `BOOTSTRAP.md` — the source BOOTSTRAP.md is synced, but legacy copies in targets that predate the system are removed).

---

## 🔧 Prerequisites

| Tool | Minimum Version | Purpose |
|---|---|---|
| **Node.js** | 20+ | MCP servers (npx), Playwright |
| **PowerShell** | 7.6+ (pwsh) | Scripts, session locks, git ops |
| **Git** | 2.30+ | Version control, commit/push gate |

---

## 🔐 Environment Setup

### `.env` File (Never Commit)

```bash
# At project root
EXA_API_KEY=exa-xxx
```

```powershell
# Load in PowerShell
. .\.env
```

### API Keys

| Service | Where to Get | Tier |
|---|---|---|
| **Exa** | exa.ai → Dashboard | Tier 2 (optional) |
| **Context7** | No key needed | Tier 1 (always) |
| **Playwright** | No key (Node 20+) | Tier 1 (always) |
| **Trello** | One-time OAuth consent | OAuth (optional) |

---

## 🌐 MCP Fallback Tiers

| Tier | Description | Servers |
|---|---|---|
| **1** | Always works, no keys | Context7, Playwright, Playwright-headless, g-search, arXiv |
| **2** | Requires env keys | Exa |
| **OAuth** | Remote, browser consent | Trello |

**Web search fallback:** Direct `curl` to Google — no API key, no MCP.

---

## 📁 Repository Hygiene

### `.gitignore` (Add Immediately)

```gitignore
# Secrets
.env
.env.*
secrets/
*.pem
*.key

# Session state
SESSION_STATE-*.md

# Locks
.session-locks/

# OS/Editor
.DS_Store
Thumbs.db
.vscode/
.idea/
*.swp
```

### `.gitattributes` (LF Normalization)

```gitattributes
* text=auto eol=lf
```

---

## 🎯 First Session Walkthrough

### 1. Open Agent in Target Repo

```bash
cd <target-project>
# Open opencode
# Describe a task:
```

### 2. Describe Task

**Concrete target (Structured):**
```text
Review src/auth/token.ts for security issues.
```

**Goal without target (Full mode):**
```text
Add user authentication with JWT tokens.
```

**Quick fix (Direct):**
```text
Fix typo in README.md line 42.
```

### 3. Agent Behavior

| Input Type | Mode | Flow |
|---|---|---|
| File/module/snippet | STRUCTURED | CHECKLIST → DOCS → REVIEW → PLAN → PATCH |
| Directory/glob/feature | STRUCTURED | CHECKLIST (with discovery) → ... |
| Goal/spec no target | STRUCTURED | INTAKE → BACKLOG → SPRINT → TASK_PLAN → SPEC → CHECKLIST → ... |
| Greenfield (empty repo) | STRUCTURED | INTAKE (Stack/Style) → PLAN-first (CHECKLIST/REVIEW skipped) |
| Exploratory question | DISCUSS | Conversation, promote to formal if needed |

### 4. You Hold the Gates

- **REVIEW** — Confirm findings, mitigations, preservation constraints
- **PLAN** — Explicit approval + complete rewrite contract
- **PATCH** — Commit/push gate (ask before commit)

---

## 🔍 Troubleshooting Quick Reference

| Symptom | Cause | Fix |
|---|---|---|
| MCP server missing | Token not exported | `echo $EXA_API_KEY` → re-run `source .env` |
| Agent ignores phases | `AGENTS.md` not at root | Confirm at repo root; some need `--context AGENTS.md` |
| Immediate `BLOCKED` | Missing lib/version info | Agent reads from manifests/lockfiles; `BLOCKED` only after search fails |
| Trello tools absent | OAuth not done | `opencode mcp auth trello` → restart |
| Playwright won't launch | Node old / browser missing | Node 20+; `npx playwright install` |
| Exa auth error | Wrong header | Exa uses `x-api-key` |

---

## 📚 Next Steps

| Topic | Document |
|---|---|
| Persona selection | `USER_GUIDE/PERSONAS.md` |
| Phase flow details | `USER_GUIDE/PHASES.md` |
| Execution modes | `USER_GUIDE/EXECUTION_MODES.md` |
| Common issues | `USER_GUIDE/TROUBLESHOOTING.md` |
| Architecture | `REFERENCE/SYSTEM_OVERVIEW.md` |
| OpenCode adapter | `USER_GUIDE/OPENCODE.md` |
| Project management | `PROJECT_MANAGEMENT/` |
