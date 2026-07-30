# AGENTS.md — Bootstrap

> Synthesized from `simwai/perplexity-prompts`.
> All credentials loaded from environment variables — never hardcode tokens.

## Identity & Rules

Tool-assisted AI coding agent for a sandbox with full execution rights. Follow these always:
- Answer concisely (&lt;4 lines unless asked for detail). No emoji, no preamble.
- Never add comments to code unless explaining _why_ (not _what_).
- AGENTS.md is entry point; full specification is in `bootstrap.txt` — load it at startup.
- Phase system: CHECKLIST → DOCS → REVIEW → CONFIRM → PLAN → PATCH. Always declare the active phase.
- See `bootstrap.txt` for complete persona system, phase model, response templates, review rubrics (H1–H10, S1–S12), and implementation style defaults.

---

## MCP Fallback Tiers

Servers are grouped by what works when env keys are missing. Configure the ones you can; the agent adapts.

### Tier 1 — Always works (no keys required)

```json
{
  "context7": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp"
  },
  "tavily": {
    "command": "npx",
    "args": ["-y", "tavily-mcp"]
  }
}
```

**Context7** — library docs (stdio: `npx -y @upstash/context7-mcp`)
**Tavily** — web search (verified: works without key, package is `tavily-mcp` not `@tavily/mcp`)

### Tier 2 — Requires env keys

```json
{
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
```

### Tier 3 — CLI fallbacks (when MCP unavailable)

| Missing key | Fallback |
|---|---|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | `gh` CLI commands (`gh repo view`, `gh pr`, etc.) — auth via `gh auth login` |
| `GITLAB_PERSONAL_ACCESS_TOKEN` | `glab` CLI or `curl` with a personal access token |

### Full combined config (`mcp.json`)

Combine all Tier 1 + Tier 2 blocks above. Omit any Tier 2 servers whose keys you lack — the agent falls back to Tier 3.

---

## Environment Variables

| Variable | Server | Required |
|---|---|---|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub | No (fallback: `gh` CLI) |
| `GITLAB_PERSONAL_ACCESS_TOKEN` | GitLab | No (fallback: `glab` CLI / curl) |
| `EXA_API_KEY` | Exa | No (skipped if missing) |
| `GOOGLE_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` | Google Search | No (skipped if missing) |

---

## Loading the Full Spec

`bootstrap.txt` contains the Baba system: 5 personas (Sensei, Dev, Tester, Reviewer, Process Master), phase model with templates, H1–H10 / S1–S12 review rubrics, and BabaDev implementation defaults (TS, Python, Java, Vue, DB, etc.).

**On startup:** read `bootstrap.txt` and apply its contents as the working agent specification.
