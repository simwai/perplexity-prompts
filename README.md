# perplexity-prompts
Phase-oriented prompt system for structured AI code review sessions.

## Agent Instructions

This repository provides structured instructions for AI coding agents to ensure high-quality code reviews and implementations through a phase-gated workflow.

- [AGENTS.md](AGENTS.md): Agent instructions with Model Context Protocol (MCP) support for tools like Context7, Tavily, Playwright, Trello, and Exa.

## Layout

```
AGENTS.md      The single entry file — paste at a target repo root.
system/        The copy-paste unit — contains bootstrap.txt, modules/, personas/.
docs/          Usage documentation.
```

## Deploy

Copy the system into a target project in two steps:

```powershell
Copy-Item -Recurse system <target-project>\system
```

Then paste `AGENTS.md` content as `AGENTS.md` at the target repo root.

For detailed instructions, see [docs/AGENTS-usage.md](docs/AGENTS-usage.md).
