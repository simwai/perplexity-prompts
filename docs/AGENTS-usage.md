# How to Use AGENTS.md

## What It Is

`AGENTS.md` sits at the repo root. When an AI coding agent (Claude Code, Cursor Agent, Codex, etc.) starts a session, it reads the file first and loads:
1. **MCP server configs** — organized by fallback tiers (Tier 1 works without keys)
2. A pointer to `bootstrap.txt` — which contains the full persona system, phase model, rubrics, and implementation style

This replaces the old two-file approach (`AGENTS.md` vs `AGENTS_WITHOUT_MCP.md`). A single file now handles both cases via the fallback tier system.

---

## MCP Fallback Tiers

| Tier | Description | Examples |
|---|---|---|
| 1 | Always works, no keys needed | Context7 (library docs), Tavily (web search) |
| 2 | Requires env keys | GitHub, GitLab, Exa, Google Search |
| 3 | CLI fallbacks when MCP unavailable | `gh` CLI, `glab` CLI / curl |

Configure what you can in `mcp.json`. Servers with missing keys are skipped silently — the agent adapts.

---

## Prerequisites

**Node.js 20+** — required for stdio MCP servers (`npx`).

**`.env` file** at project root — never hardcode tokens:
```bash
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx
GITLAB_PERSONAL_ACCESS_TOKEN=glpat-xxx
EXA_API_KEY=exa-xxx
GOOGLE_API_KEY=AIzaSy_xxx
GOOGLE_SEARCH_ENGINE_ID=xxx
```
Load before starting: `source .env` — and add `.env` to `.gitignore` immediately.

**API keys:**

| Service | Where |
|---|---|
| GitHub PAT | Settings -> Developer settings -> Personal access tokens (`repo`, `read:org`, `workflow`) |
| GitLab PAT | Settings -> Access Tokens (`api`, `read_api`) |
| Google API Key | console.cloud.google.com -> Credentials (enable Custom Search API) |
| Google Search Engine ID | cse.google.com -> Create engine |
| Exa | exa.ai -> Dashboard |
| Context7 | No key needed |
| Tavily | No key needed |

---

## MCP Configuration

### Example `mcp.json` (Tier 1 + Tier 2 combined)

```json
{
  "mcpServers": {
    "context7": { "type": "http", "url": "https://mcp.context7.com/mcp" },
    "tavily": { "command": "npx", "args": ["-y", "tavily-mcp"] },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}" }
    },
    "gitlab": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-gitlab"],
      "env": {
        "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_PERSONAL_ACCESS_TOKEN}",
        "GITLAB_API_URL": "${GITLAB_API_URL:-https://gitlab.com/api/v4}"
      }
    },
    "exa": {
      "type": "http",
      "url": "https://mcp.exa.ai/mcp",
      "headers": { "x-api-key": "${EXA_API_KEY}" }
    },
    "google-search": {
      "command": "npx",
      "args": ["-y", "@adenot/mcp-google-search"],
      "env": {
        "GOOGLE_API_KEY": "${GOOGLE_API_KEY}",
        "GOOGLE_SEARCH_ENGINE_ID": "${GOOGLE_SEARCH_ENGINE_ID}"
      }
    }
  }
}
```

### Verify it works
Ask the agent: *"List the available MCP tools."* You should see tools from Context7 and Tavily at minimum. If GitHub/GitLab are missing, the env vars aren't exported.

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
- Give GitHub PAT only the scopes it needs — not a full-access token
- H1 in the hard-tier rubric will flag the agent's own output if it accidentally echoes credentials
- Context7 and Tavily are remote endpoints — don't send proprietary code as search queries

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| MCP server missing | Token not exported | `echo $GITHUB_PERSONAL_ACCESS_TOKEN` — re-run `source .env` if empty |
| Agent ignores phases | `AGENTS.md` not read | Confirm it's at repo root; some agents need `--context AGENTS.md` |
| Immediate `BLOCKED` | Missing library/version info | Include the library name + version in your task description |
| GitHub 404 | Wrong branch name | Default branch is `master` — check with `git branch` |
| Exa auth error | Wrong header key | Exa: `x-api-key` |
| Tavily still broken | Wrong package name | Use `tavily-mcp` (not `@tavily/mcp`) |
