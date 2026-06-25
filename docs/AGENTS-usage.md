# How to Use AGENTS.md

## What It Is

`AGENTS.md` (or `AGENTS_WITHOUT_MCP.md`) sits at the repo root. When an AI coding agent (Claude Code, Cursor Agent, Codex, etc.) starts a session, it reads the file first and automatically loads the persona, phase model, rubrics, and (optionally) MCP configs — no manual prompting needed.

It does three things:
1. (Full version only) Tells the agent which **MCP servers to connect** and where to load tokens from
2. Defines the **five personas** (BabaSensei, BabaDev, BabaTester, BabaReviewer, Process Master)
3. Enforces a **phase-gated workflow** — the agent can never patch without your approval

---

## Which Version to Use?

This repository provides two flavors of the agent instructions:

| File | Use case |
|---|---|
| `AGENTS.md` | **Recommended.** Best for agents that support MCP (Claude Code, Cursor Agent, etc.). Enables web search, GitHub integration, and library doc lookup. |
| `AGENTS_WITHOUT_MCP.md` | Best for restricted environments or agents that don't support MCP. Provides the same persona and phase model without external tool requirements. |

**To use either:** Copy the desired file to your project root and rename it to `AGENTS.md`.

---

## Prerequisites (MCP Version)

**Node.js 20+** — required for the stdio MCP servers (`npx`).

**`.env` file** at project root — never hardcode tokens:
```bash
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx
GOOGLE_API_KEY=AIzaSy_xxx
GOOGLE_SEARCH_ENGINE_ID=xxx
EXA_API_KEY=exa-xxx
TAVILY_API_KEY=tvly-xxx
```
Load it before starting: `source .env` — and add `.env` to `.gitignore` immediately.

**API keys:**

| Service | Where |
|---|---|
| GitHub PAT | Settings → Developer settings → Personal access tokens (`repo`, `read:org`, `workflow`) |
| Google API Key | console.cloud.google.com → Credentials (enable Custom Search API) |
| Google Search Engine ID | cse.google.com → Create engine |
| Exa | exa.ai → Dashboard |
| Tavily | tavily.com → Dashboard |
| Context7 | No key needed |

---

## MCP Configuration

### Claude Desktop / Claude Code

Edit `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}" }
    },
    "google-search": {
      "command": "npx",
      "args": ["-y", "@adenot/mcp-google-search"],
      "env": {
        "GOOGLE_API_KEY": "${GOOGLE_API_KEY}",
        "GOOGLE_SEARCH_ENGINE_ID": "${GOOGLE_SEARCH_ENGINE_ID}"
      }
    },
    "context7": { "type": "http", "url": "https://mcp.context7.com/mcp" },
    "exa": {
      "type": "http",
      "url": "https://mcp.exa.ai/mcp",
      "headers": { "x-api-key": "${EXA_API_KEY}" }
    },
    "tavily": {
      "type": "http",
      "url": "https://mcp.tavily.com/mcp",
      "headers": { "Authorization": "Bearer ${TAVILY_API_KEY}" }
    }
  }
}
```

Restart Claude Desktop after saving. `${VAR}` is resolved from your shell env.

### Cursor Agent
Add the same block to `.cursor/mcp.json` at project root — Cursor picks it up per workspace.

### Verify it works
Ask the agent: *"List the available MCP tools."* You should see tools from all five servers. If one is missing, the env var isn't exported in the shell that launched the agent.

---

## Starting a Session

Open a session in a repo that has `AGENTS.md` at root and just describe the task. The agent will:
1. Read `AGENTS.md` (or `AGENTS_WITHOUT_MCP.md`)
2. Pick the right persona for the task type
3. Declare the starting phase in its first response
4. (Full version only) Reach for MCP tools automatically — GitHub for file contents, Exa/Tavily/Google for docs, Context7 for library references

**Examples:**

```
Review src/auth/token.ts for security issues.
→ Agent starts CHECKLIST, looks up library docs via Context7, walks DOCS → REVIEW → CONFIRM → PLAN, waits for approval before patching.

Add rate limiting to the Express API using express-rate-limit.
→ Agent fetches current docs, proposes a plan, patches only after you confirm.

What search MCP servers exist in modelcontextprotocol/servers?
→ Agent uses GitHub MCP to read the repo directly — no cloning needed.
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
CHECKLIST → DOCS → REVIEW → CONFIRM → PLAN → PATCH
```

**You hold the gate at CONFIRM and PLAN** — the agent cannot advance without your explicit approval. Missing input → `BLOCKED`. Second failure → `FAILURE` and clean stop.

---

## Security Notes

- Never commit `.env`
- Give the GitHub PAT only the scopes it needs — not a full-access token
- H1 in the hard-tier rubric will flag the agent's own output if it accidentally echoes credentials
- Context7, Exa, Tavily are remote HTTPS endpoints — don't send proprietary code as search queries

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| MCP server missing | Token not exported | `echo $GITHUB_PERSONAL_ACCESS_TOKEN` — re-run `source .env` if empty |
| Agent ignores phases | `AGENTS.md` not read | Confirm it's at repo root; some agents need `--context AGENTS.md` |
| Immediate `BLOCKED` | Missing library/version info | Include the library name + version in your task description |
| GitHub 404 | Wrong branch name | Default branch is `master` — check with `git branch` |
| Exa/Tavily auth error | Wrong header key | Exa: `x-api-key`, Tavily: `Authorization: Bearer` |
