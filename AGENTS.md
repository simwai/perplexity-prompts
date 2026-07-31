# AGENTS.md — Bootstrap

> Synthesized from `simwai/perplexity-prompts`.
> All credentials loaded from environment variables — never hardcode tokens.

## Deploy

This file is the copy-paste unit. Deploying the system into a target project takes two steps:
1. **Paste this file** as `AGENTS.md` at the target repo root.
2. **Copy the `system/` folder** next to it (contains `bootstrap.txt`, `modules/`, `personas/`).

```powershell
Copy-Item -Recurse system <target-project>\system
```

## Identity & Rules

Tool-assisted AI coding agent for a sandbox with full execution rights. Follow these always:
- Answer concisely (&lt;4 lines unless asked for detail). No emoji, no preamble.
- Never add comments to code unless explaining _why_ (not _what_).
- AGENTS.md is entry point; full specification is in `system/bootstrap.txt` — load it at startup.
- Phase system: CHECKLIST → DOCS → REVIEW → CONFIRM → PLAN → PATCH. Always declare the active phase.
- See `system/bootstrap.txt` for complete persona system, phase model, response templates, review rubrics (H1–H10, S1–S12), and implementation style defaults.

---

## MCP Fallback Tiers

Servers are grouped by what works when env keys are missing. Configure the ones you can; the agent adapts. Decision guidance for *when* to invoke each server: `system/modules/21-mcp-invocation.txt`.

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
  },
  "playwright": {
    "command": "npx",
    "args": ["-y", "@playwright/mcp@latest"]
  }
}
```

**Context7** — library docs (stdio: `npx -y @upstash/context7-mcp`)
**Tavily** — web search (verified: works without key, package is `tavily-mcp` not `@tavily/mcp`)
**Playwright** — browser automation for live UI verification and e2e walk-throughs (Node 20+; headed by default, add `--headless` for automation)

### Tier 2 — Requires env keys

```json
{
  "exa": {
    "type": "http",
    "url": "https://mcp.exa.ai/mcp",
    "headers": { "x-api-key": "${EXA_API_KEY}" }
  }
}
```

### Trello — Remote OAuth (no env keys)

```json
{
  "trello": {
    "type": "remote",
    "url": "https://mcp.trello.com/v1",
    "oauth": {}
  }
}
```

Work tracking (cards, boards, lists, tasks, PR/issue/CI status) lives in Trello. One-time browser OAuth consent, workspace-scoped. No API key.

### Web search without keys

Google web search must never require `GOOGLE_API_KEY` / `GOOGLE_SEARCH_ENGINE_ID`. Default is direct curl to Google's URL format:

```bash
curl -s "https://www.google.com/search?q=<url-encoded-query>"
```

### Full combined config (`mcp.json`)

Combine all Tier 1 + Tier 2 + Trello blocks above. Omit any Tier 2 servers whose keys you lack — the agent adapts via the fallback ladder in `system/modules/21-mcp-invocation.txt`.

---

## Environment Variables

| Variable | Server | Required |
|---|---|---|
| `EXA_API_KEY` | Exa | No (skipped if missing) |

---

## Loading the Full Spec

`system/bootstrap.txt` contains the Baba system: 5 personas (Sensei, Dev, Tester, Reviewer, Process Master), phase model with templates, H1–H10 / S1–S12 review rubrics, and BabaDev implementation defaults (TS, Python, Java, Vue, DB, etc.).

**On startup:** read `system/bootstrap.txt` and apply its contents as the working agent specification.
