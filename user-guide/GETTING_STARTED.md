# GETTING STARTED

> **Deploy, prerequisites, first session** — Complete setup guide.

---

## Deployment

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
- Use `-DeleteLegacy` to remove old `.claude/`, `.cursor/`, `.codex/`, `BOOTSTRAP.md` files and other legacy artifacts (`system/`, `synced-scripts/`, `agent-resources/`, `CLAUDE.md`) plus **memory-worth plugin test files** (from `.opencode` source, not project tests)

**Sync options:**

| Flag | Purpose |
|---|---|
| `-All` | Sync all configured targets non-interactively |
| `-DryRun` | Preview what would be copied without making changes |
| `-NoGitPush` | Commit locally but skip push to remotes |
| `-DeleteLegacy` | Remove legacy folders (`.claude/`, `.cursor/`, `.codex/`, `system/`, `synced-scripts/`, `agent-resources/`, `CLAUDE.md`, `BOOTSTRAP.md`) + memory-worth test files |

> **Note:** The `.opencode/` folder is synced from source. **BOOTSTRAP.md is removed** as it's superseded by the `prompt-system/` deployment. **Memory-worth plugin test files** (e.g., `.opencode/plugins/memory-worth/db/*.test.ts`, `.opencode/plugins/memory-worth/hooks/*.test.ts`, etc.) are also removed — these are test artifacts from the `.opencode` source, NOT your project's legitimate test folders. The sync copies: `prompt-system/`, `.opencode/`, `.opencode/agents/`, and core files (`AGENTS.md`, `opencode.jsonc` — BOOTSTRAP.md is NOT synced).

---

## Prerequisites

| Tool | Minimum Version | Purpose |
|---|---|---|
| **Node.js** | 20+ | MCP servers (npx), Playwright |
| **PowerShell** | 7.6+ (pwsh) | Scripts, git ops |
| **Git** | 2.30+ | Version control, commit/push gate |

---

## Environment Setup

### `.env` File (Never Commit)

```bash
# At project root -- plain KEY=VALUE lines, no `export`, no quotes
EXA_API_KEY=exa-xxx
```

```powershell
# Load in PowerShell 7.6+ -- parse each line into this session's environment
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    Set-Item -Path "Env:$($matches[1])" -Value $matches[2]
  }
}

# Verify
$env:EXA_API_KEY
```

PowerShell has no built-in `.env` parser. `. .\.env` is a syntax error because
it tries to execute the file as a script, and `source .env` does not exist in
PowerShell at all. Use the loop above, or start the agent from a shell that has
the variable already exported.

### API Keys

| Service | Where to Get | Tier |
|---|---|---|
| **Exa** | exa.ai → Dashboard | Tier 2 (optional) |
| **Context7** | No key needed | Tier 1 (always) |
| **Playwright** | No key (Node 20+) | Tier 1 (always) |
| **Trello** | One-time OAuth consent | OAuth (optional) |

---

## MCP Fallback Tiers

| Tier | Description | Servers |
|---|---|---|
| **1** | Always works, no keys | Context7, Playwright, Playwright-headless, g-search, arXiv |
| **2** | Requires env keys | Exa |
| **OAuth** | Remote, browser consent | Trello |

**Web search fallback:** Direct `curl` to Google — no API key, no MCP.

---

## Repository Hygiene

### `.gitignore` (Add Immediately)

```gitignore
# Secrets
.env
.env.*
secrets/
*.pem
*.key

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

## First Session Walkthrough

Worked examples with the resulting phase flow are in
[QUICKSTART.md](../QUICKSTART.md) `## First Session`. This section covers what
happens after you type.

### 1. Open Agent in Target Repo

```bash
cd <target-project>
# Open opencode
# Describe a task:
```

### 2. Agent Behavior

The agent classifies your input and picks a mode before it does anything else.

| Input Type | Mode | Flow |
|---|---|---|
| File/module/snippet | STRUCTURED | CHECKLIST → DOCS → REVIEW → PLAN → PATCH |
| Directory/glob/feature | STRUCTURED | CHECKLIST (with discovery) → ... |
| Goal/spec no target | STRUCTURED | INTAKE → BACKLOG → SPRINT → TASK_PLAN → SPEC → CHECKLIST → ... |
| Greenfield (empty repo) | STRUCTURED | INTAKE (Stack/Style) → PLAN-first (CHECKLIST/REVIEW skipped) |
| Exploratory question | DISCUSS | Conversation, promote to formal if needed |
| Clear, low-blast-radius edit | DIRECT | No phase templates, per-edit lint gate, commit/push gate |

### 3. You Hold the Gates

- **REVIEW** — Confirm findings, mitigations, preservation constraints
- **PLAN** — Explicit approval + complete rewrite contract
- **PATCH** — Commit/push gate (ask before commit)

---

## Troubleshooting Quick reference

| Symptom | Cause | Fix |
|---|---|---|
| MCP server missing | Token not exported | `$env:EXA_API_KEY` → reload `.env` using the snippet above |
| Agent ignores phases | `AGENTS.md` not at root | Confirm at repo root; some need `--context AGENTS.md` |
| Immediate `BLOCKED` | Missing lib/version info | Agent reads from manifests/lockfiles; `BLOCKED` only after search fails |
| Trello tools absent | OAuth not done | `opencode mcp auth trello` → restart |
| Playwright won't launch | Node old / browser missing | Node 20+; `npx playwright install` |
| Exa auth error | Wrong header | Exa uses `x-api-key` |

---

## Next Steps

| Topic | Document |
|---|---|
| Persona selection | `user-guide/PERSONAS.md` |
| Phase flow details | `user-guide/PHASES.md` |
| Execution modes | `user-guide/EXECUTION_MODES.md` |
| Common issues | `user-guide/TROUBLESHOOTING.md` |
| Architecture | `SYSTEM_OVERVIEW.md` |
| OpenCode adapter | `AGENTS_USAGE.md` |
| Project management | `project-management/` |
