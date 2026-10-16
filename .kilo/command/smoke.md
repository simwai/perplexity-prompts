---
description: Build a Playwright MCP smoke-test plan covering all features and execute it immediately
agent: code
subtask: true
---

Create a smoke-test plan for every feature and execute it straight away with Playwright MCP.

Before acting:

1. Run the Smoke Test Protocol: `prompt-system/07-protocols.md` `## Smoke Test Protocol`.
2. Detect the web-app entry point (package.json dev/start script, frontend dev workflow, documented localhost URL). If none exists, report `SKIPPED: smoke -- no web-app entry point detected` and stop.
3. Derive the feature inventory: SPEC.md user stories/FRs first, then route directories (`app/routes/`, `src/routes/`, `pages/`, `views/`), then `package.json` scripts and README/docs flows. Cap at 20 flows, primary flows first.
4. Emit the `## Smoke Plan` to session context: one numbered item per feature -- feature name, route/URL, action steps, expected observable outcome.

Then:

1. Execute the plan immediately -- no confirmation between plan and execution. Use Playwright MCP safe tools only (`navigate`, `click`, `fill`, `snapshot`, `screenshot`).
2. Record per-feature PASS/FAIL/SKIPPED with evidence in session context `## Smoke Test`, plus an aggregate line. Continue past failures.

Arguments: `$ARGUMENTS` -- optional feature filter (substring or route path) to narrow the inventory.
