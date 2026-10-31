# AGENTS.md - Entry Point

> All credentials loaded from environment variables - never hardcode tokens.

## Deploy

This file is the copy-paste unit. Deploying the system into a target project takes two steps:

1. **Paste this file** as `AGENTS.md` at the target repo root.
2. **Copy the `prompt-system/` folder** next to it (contains the system files and `prompt-system/scripts/`).

```powershell
Copy-Item -Recurse prompt-system <target-project>\prompt-system
```

Repo-root tooling (`generate-adapters.ps1`, `sync.ps1`, `pre-commit.ps1`, root `scripts/*.ps1`) is host-side operational tooling, not part of the deployed runtime; a target references it only when it adopts the full repo.

## Identity & Rules

Tool-assisted AI coding agent for a sandbox with full execution rights. The authoritative rule set lives in `prompt-system/00-system.md` `## Identity`; these are the host-critical rules:

- Always answer in English. Every response, in any mode, phase, or persona, is in English regardless of the user's language.
- No emoji, no preamble. Use the ASCII double hyphen `--` for parenthetical breaks; never Unicode dash characters.
- Never ask the user to provide files, paths, versions, or snippets that a filesystem search (`rg` + file tools) can find.
- Search locates, full read comprehends: read files in full (largest window, offset-chunked until EOF) before editing or judging them; never act on snippets alone.
- Module loading is tiered, not discretionary: load the always-load [core] tier at STARTUP and every file `prompt-system/00-system.md` lists for the active phase before that phase's output. Skipping a listed file is a protocol breach, not a choice.
- AGENTS.md is the sole entry point; `prompt-system/00-system.md` is the orchestrator and routing file -- load it at startup, then follow its load order. Canonical rules live in `prompt-system/` (orchestrator + routing, decision format, output contracts, rubrics, implementation style, operational protocol + commit/push gate, cross-cutting protocols, Plan-Versus-Actual Gate).
- Adaptive execution: default `AUTO`, use `DIRECT` for clear low-risk work, and use `STRUCTURED` for risky, broad, or ambiguous work. The structured flow is CHECKLIST -> DOCS -> REVIEW -> PLAN -> PATCH; REVIEW owns confirmation. Direct responses use `[MODE: DIRECT]`; structured responses declare the phase.

---

## MCP Fallback Tiers

Servers are grouped by what works when env keys are missing. Configure the ones you can; the agent adapts. Decision guidance for _when_ to invoke each server: `prompt-system/00-system.md` `## MCP tool selection`.

**Update policy**: stdio servers launched via `npx`/`uvx` are pinned where a version is known (`@playwright/mcp@0.0.80`) and otherwise resolve to latest at launch -- bump pins deliberately, never silently. Remote HTTP/OAuth endpoints (context7, exa, trello) are URL-based and versionless; review their docs before relying on behavior changes.

### Tier 1 - Always works (no keys required)

```json
{
  "context7": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp"
  },
  "playwright": {
    "command": "npx",
    "args": ["-y", "@playwright/mcp@0.0.80"]
  },
  "playwright-headless": {
    "command": "npx",
    "args": ["-y", "@playwright/mcp@0.0.80", "--headless"]
  },
  "g-search": {
    "command": "npx",
    "args": ["-y", "g-search-mcp"]
  },
  "arxiv": {
    "command": "uvx",
    "args": ["arxiv-mcp-server"]
  },
  "memory-worth": {
    "command": "npx",
    "args": ["-y", "tsx", ".opencode/packages/memory-worth/mcp-server.ts"]
  }
}
```

**memory-worth** - the memory-worth package's 13 trust-scored memory tools (search, get, write, update, delete, synthesize, wakeup, stats, tune, invalidate, merge, set_status, list_tools), exposed over MCP via stdio. The DB lives at `%LOCALAPPDATA%\memory-worth\memory.db` by default; override with `MEMORY_WORTH_DB` (full path) or `MEMORY_WORTH_HOME` (directory). `MEMORY_WORTH_DIR` is kept as a deprecated alias. Every runtime namespaces MCP tools with the server name, so call them as `memory-worth_memory_search`, `memory-worth_memory_write`, `memory-worth_memory_stats`. (The sample command's `.opencode/packages/memory-worth/mcp-server.ts` path is this repo's bundled copy -- on other hosts point the command at your own checkout or an installed package.)

**memory-worth** - persistent agent memory with project-scoped routing:

- Search memory before answering whenever prior session context could help. `scope: auto` (default) searches current project + global, ranked current-first.
- Write durable insights explicitly with `memory_write`. The `applies_when` field is required; prefer updating an existing memory over duplicating it. `scope: auto` routes grounded content to the current repo; ungrounded convention/reference memories go to the shared `global` scope.
- Trust labels are population quantiles: high = co-occurred with success, low = co-occurred with failure, unproven = too little evidence. Treat low-trust memories as hypotheses, not facts.
- Ground every write to a file, symbol, or git ref -- a post-hoc filter cannot repair an ungrounded entry.
- `memory_wakeup` returns the resolved session id and protocol reminder at session start; session identity is synthetic (MCP has no hooks).

**Context7** - library docs (remote HTTP, no key)
**Playwright** - browser automation for live UI verification and e2e walk-throughs (Node 20+; headed for testing)
**Playwright-headless** - headless browser for web search and scraping (Node 20+; `--headless` flag)
**Playwright bootstrap** -- run `scripts/ensure-playwright.ps1` before first use or after fresh clones; checks Node ≥ 20, resolves `@playwright/mcp`, installs missing browser binaries.
**g-search** - Google web search via MCP (no key required; requires Playwright Chromium: `npx playwright install chromium`)
**arXiv** - academic paper search and local literature management via MCP (no key required; requires `uvx`; bootstrap: `scripts/ensure-uvx.ps1`)

**OpenCode PTY** -- interactive terminal plugin: background processes, multiple sessions, stdin, output regex filter. Auto-installed by OpenCode on next run.

### Tier 2 - Requires env key

```json
{
  "exa": {
    "type": "remote",
    "url": "https://mcp.exa.ai/mcp",
    "headers": { "x-api-key": "{env:EXA_API_KEY}" }
  }
}
```

> **Note**: Omit this entire block if `EXA_API_KEY` is not set. The agent will use `g-search` as the no-key fallback per `prompt-system/00-system.md` `## MCP tool selection`. Hosts that do not interpolate `{env:VAR}` in headers need the literal key configured at setup time -- never committed.

### Trello - Remote OAuth (no env keys)

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

Google web search must never require `GOOGLE_API_KEY` / `GOOGLE_SEARCH_ENGINE_ID`. Default is the `g-search` MCP server when available, with direct curl to Google's URL format as the last resort:

```bash
curl -s "https://www.google.com/search?q=<url-encoded-query>"
```

### Full combined config (`mcp.json`)

Combine all Tier 1 + Tier 2 + Trello blocks above. Omit any Tier 2 servers whose keys you lack - the agent adapts via the fallback ladder in `prompt-system/00-system.md`.

---

## Environment Variables

| Variable      | Server | Required                |
|---------------|--------|-------------------------|
| `EXA_API_KEY` | Exa    | No (g-search fallback when unset) |
| `SESSION_ID`  | session locks / commit gate | No (per-process fallback; required for two-session mode) |
| `BABA_READ_ONLY` | read-only host detection | No (set `1`/`true`/`yes` on read-only hosts) |
| `MEMORY_WORTH_DB` / `MEMORY_WORTH_HOME` | memory-worth | No (defaults to `%LOCALAPPDATA%\memory-worth\memory.db`) |
| `BABA_DEBUG` / `BABA_DEBUG_FILE` / `BABA_DEBUG_LEVEL` | opencode plugin debug output | No |

---

<HIGH_PRIO>
!!!

## Loading the System (MANDATORY - immediate, before any other action)

AGENTS.md is the sole entry point. The system lives in `prompt-system/`.

**Immediately after reading this file (no exceptions):**

1. Read `AGENTS.md` in full (largest window; continue with offset reads until EOF).
2. Read `prompt-system/00-system.md` in full the same way -- it contains the authoritative `## Load order`.
3. Load the always-load [core] tier from that load order in full across offset chunks.
4. **Record completion** in session state `## Startup Verification` (or conversation carrier on READ_ONLY).
5. Conditional tiers ([review], [stack], [designer], [doc], [logical], [domain]) load just-in-time at phase entry per the load order -- never pre-loaded wholesale.

All always-load files must be fully read (EOF reached) before ANY other action. This is not optional, not conditional. If loading is incomplete, the agent must not proceed -- output `BLOCKED` with reason "STARTUP incomplete".

</HIGH_PRIO>
