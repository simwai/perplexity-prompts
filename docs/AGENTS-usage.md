# How to Use AGENTS.md

## What It Is

`AGENTS.md` sits at the repo root. When an AI coding agent (Claude Code, Cursor Agent, Codex, etc.) starts a session, it reads the file first and loads:
1. **MCP server configs** — organized by fallback tiers (Tier 1 works without keys)
2. A pointer to `bootstrap.txt` — which contains the full persona system, phase model, rubrics, and implementation style

This is the single entry point for AI coding agents; MCP servers are covered by the fallback tier system.

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
1. Read `AGENTS.md` — bootstrap identity, MCP tiers, reference to `bootstrap.txt`
2. Read `bootstrap.txt` — persona system, phase model, rubrics, implementation style
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
| **BabaSensei** | You want mentorship feedback, not code | "Use BabaSensei to review X" |
| **BabaDev** | You want implementation with a plan gate | "Use BabaDev to implement X" |
| **BabaTester** | You want adversarial QA + test strategy | "Use BabaTester to test X" |
| **BabaReviewer** | You want a hard/soft tier quality verdict | "Use BabaReviewer to review X" |
| *(default)* | Agent picks based on the task | Just describe the task |

BabaSensei stops at **HANDOFF** — never writes code. BabaTester stops at **TEST_STRATEGY** — never plans fixes. Scope creep is structurally impossible.

---

## Phase Flow

The agent prints the phase at the top of every response.

```
CHECKLIST -> DOCS -> REVIEW -> CONFIRM -> PLAN -> PATCH
```

**You hold the gate at CONFIRM and PLAN** — the agent cannot advance without your explicit approval. Missing input -> `BLOCKED`. Second failure -> `FAILURE` and clean stop.

---

## Security Notes

- Never commit `.env`
- H1 in the hard-tier rubric will flag the agent's own output if it accidentally echoes credentials
- Context7, Tavily, Exa, and Trello are remote endpoints — don't send proprietary code as search queries
- Playwright `browser_run_code_unsafe` runs arbitrary JS — trusted sessions only

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
