# perplexity-prompts
Phase-oriented prompt system for structured AI code review sessions.

## Agent Instructions

This repository provides structured instructions for AI coding agents to ensure high-quality code reviews and implementations through a phase-gated workflow.

- [AGENTS.md](AGENTS.md): Agent instructions with Model Context Protocol (MCP) support for tools like Context7, Tavily, Playwright, Trello, and Exa.

## Layout

```
AGENTS.md          The single entry file — paste at a target repo root.
system/            The copy-paste unit — contains bootstrap.txt, modules/.
docs/              Usage documentation.
opencode.jsonc     opencode-native config (optional layer, inert for other agents).
.opencode/         opencode persona agents and commands (optional layer).
```

## Deploy

Copy the system into a target project in two steps:

```powershell
Copy-Item -Recurse system <target-project>\system
```

Then paste `AGENTS.md` content as `AGENTS.md` at the target repo root.

For detailed instructions, see [docs/AGENTS-usage.md](docs/AGENTS-usage.md).

## opencode support

The core system (`AGENTS.md` + `system/`) is model-agnostic and works with any
agent. opencode additionally consumes `opencode.jsonc` (MCP servers, bootstrap
auto-load) and `.opencode/` (the five Baba personas as selectable agents and
`/baba`, `/phase` commands). Other agents ignore these files entirely.
