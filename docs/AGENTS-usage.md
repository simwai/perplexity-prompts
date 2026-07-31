# How to Use AGENTS.md

## What It Is

`AGENTS.md` sits at the repo root. When an AI coding agent (Claude Code, Cursor Agent, Codex, etc.) starts a session, it reads the file first and loads:
1. **MCP server configs** — organized by fallback tiers (Tier 1 works without keys)
2. A pointer to `system/bootstrap.txt` — which contains the full persona system, phase model, rubrics, and implementation style

This is the single entry point for AI coding agents; MCP servers are covered by the fallback tier system.

---

## Deploying to a Target Project

The copy-paste unit is `AGENTS.md` + the `system/` folder:

1. Paste this file as `AGENTS.md` at the target repo root.
2. Copy the `system/` folder next to it:

```powershell
Copy-Item -Recurse system <target-project>\system
```

The `system/` folder is self-contained (`bootstrap.txt`, `modules/`); all internal references stay valid after the move.

---

## MCP Fallback Tiers

| Tier | Description | Examples |
|---|---|---|
| 1 | Always works, no keys needed | Context7 (library docs), Tavily (web search), Playwright (browser automation) |
| 2 | Requires env keys | Exa |
| OAuth | Remote server, browser consent instead of a key | Trello (work tracking) |

Web search falls back to direct `curl` against Google's URL format — no API key, no MCP. Configure what you can. Servers with missing keys are skipped silently — the agent adapts.

---

## Prerequisites

**Node.js 20+** — required for stdio MCP servers (`npx`).

**`.env` file** at project root — never hardcode tokens:
```bash
EXA_API_KEY=exa-xxx
```
Load before starting: `source .env` — and add `.env` to `.gitignore` immediately.

**API keys:**

| Service | Where |
|---|---|
| Exa | exa.ai -> Dashboard |
| Context7 | No key needed |
| Tavily | No key needed |
| Playwright | No key needed (Node 20+ required) |
| Trello | No key needed (one-time OAuth consent, workspace-scoped) |

---

## MCP Configuration

### Example `mcp.json` (Tier 1 + Tier 2 + Trello combined)

```json
{
  "mcpServers": {
    "context7": { "type": "http", "url": "https://mcp.context7.com/mcp" },
    "tavily": { "command": "npx", "args": ["-y", "tavily-mcp"] },
    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] },
    "exa": {
      "type": "http",
      "url": "https://mcp.exa.ai/mcp",
      "headers": { "x-api-key": "${EXA_API_KEY}" }
    },
    "trello": {
      "type": "remote",
      "url": "https://mcp.trello.com/v1",
      "oauth": {}
    }
  }
}
```

### Verify it works
Ask the agent: *"List the available MCP tools."* You should see tools from Context7 and Tavily at minimum. If Exa is missing, the env var isn't exported. Trello appears after one-time OAuth consent.

---

## Starting a Session

Open a session in a repo that has `AGENTS.md` at root and just describe the task. The agent will:
1. Read `AGENTS.md` — bootstrap identity, MCP tiers, reference to `system/bootstrap.txt`
2. Read `system/bootstrap.txt` — persona system, phase model, rubrics, implementation style
3. Pick the right persona for the task type
4. Declare the starting phase in its first response
5. Reach for MCP tools (those available based on your configured keys)

**Examples:**

```
Review src/auth/token.ts for security issues.
-> Agent starts CHECKLIST, looks up library docs via Context7, walks DOCS -> REVIEW -> CONFIRM -> PLAN, waits for approval before patching.

Add rate limiting to the Express API using express-rate-limit.
-> Agent fetches current docs, proposes a plan, patches only after you confirm.
```

---

## Persona Reference

| Persona | Use when | Invoke with |
|---|---|---|
| **BabaScrumMaster** | You have a fuzzy goal and want it decomposed into sized, prioritized tasks | "Use BabaScrumMaster to plan X" |
| **BabaSensei** | You want mentorship feedback, not code | "Use BabaSensei to review X" |
| **BabaDev** | You want implementation with a plan gate | "Use BabaDev to implement X" |
| **BabaTester** | You want adversarial QA + test strategy | "Use BabaTester to test X" |
| **BabaReviewer** | You want a hard/soft tier quality verdict | "Use BabaReviewer to review X" |
| *(default)* | Agent picks based on the task | Just describe the task |

BabaSensei stops at **HANDOFF** — never writes code. BabaTester stops at **TEST_STRATEGY** — never plans fixes. BabaScrumMaster stops at **TASK_PLAN** — plans and sizes tasks, never patches. Scope creep is structurally impossible.

---

## Phase Flow

The agent prints the phase at the top of every response.

```
[INTAKE -> BACKLOG -> SPRINT -> TASK_PLAN ->] CHECKLIST -> DOCS -> REVIEW -> CONFIRM -> PLAN -> PATCH
```

The upstream pipeline is optional — it runs only when you supply a goal without a
concrete target; a concrete target skips it entirely.

**You hold the gate at CONFIRM and PLAN** — the agent cannot advance without your explicit approval. Missing input -> `BLOCKED`. Second failure -> `FAILURE` and clean stop.

---

## Security Notes

- Never commit `.env`
- H1 in the hard-tier rubric will flag the agent's own output if it accidentally echoes credentials
- Context7, Tavily, Exa, and Trello are remote endpoints — don't send proprietary code as search queries
- Playwright `browser_run_code_unsafe` runs arbitrary JS — trusted sessions only

---

## opencode Support

The core deploy unit (`AGENTS.md` + `system/`) is model-agnostic. opencode gets an
additional native layer that other agents (Claude Code, Cursor, Codex) ignore.

### Files

| Path | Purpose |
|---|---|
| `opencode.jsonc` | opencode config: auto-loads `AGENTS.md` + `system/bootstrap.txt` via `instructions`, registers the MCP servers from the fallback tiers. |
| `.opencode/agent/baba-*.md` | The five personas as opencode agents (`mode: primary`, selectable in the TUI). `edit: deny` on all but `baba-dev`, so "scope creep is structurally impossible" is enforced by permission rules, not just prompts. |
| `.opencode/command/baba.md` | `/baba <persona>` — activates a persona and starts the phase flow. |
| `.opencode/command/phase.md` | `/phase <NAME>` — declares the active phase and enforces its template. |

### Notes

- **Restart after changes**: opencode loads config once at startup. After editing
  `opencode.jsonc`, `.opencode/agent/*`, or `.opencode/command/*`, quit and
  restart opencode — running sessions keep the already-loaded config.
- **Env interpolation**: opencode uses `{env:VAR}`, not `${VAR}`. The `exa`
  server header is `{env:EXA_API_KEY}`; remove the `exa` entry if the key is absent.
- **Trello OAuth**: run `opencode mcp auth trello` once, then restart the session.
- **Switching persona**: switch the agent in the TUI, or run `/baba <persona>`.
  Persona modules remain the single source of truth — agent files reference
  `system/modules/` and do not duplicate their content.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| MCP server missing | Token not exported | `echo $EXA_API_KEY` — re-run `source .env` if empty |
| Agent ignores phases | `AGENTS.md` not read | Confirm it's at repo root; some agents need `--context AGENTS.md` |
| Immediate `BLOCKED` | Missing library/version info | Include the library name + version in your task description |
| Trello tools absent | OAuth not completed | Run `opencode mcp auth trello` once, then restart the session |
| Playwright won't launch | Node too old or browser missing | Use Node 20+; first run downloads browsers via `npx playwright install` |
| Exa auth error | Wrong header key | Exa: `x-api-key` |
| Tavily still broken | Wrong package name | Use `tavily-mcp` (not `@tavily/mcp`) |
