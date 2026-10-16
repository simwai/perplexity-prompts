---
name: smoke
description: Create a Playwright MCP smoke-test plan for all features and execute it immediately
argument-hint: [optional feature filter]
---

Create a smoke-test plan for every feature and execute it straight away with Playwright MCP.

Before acting:

1. Read `prompt-system/07-protocols.md` for the Smoke Test Protocol.
2. Read `prompt-system/03-output-and-state.md` for the session context schema.
3. Detect the web-app entry point (package.json dev/start script, frontend dev workflow, documented localhost URL). If none exists, report `SKIPPED: smoke -- no web-app entry point detected` and stop.
4. Derive the feature inventory: SPEC.md user stories/FRs first, then route directories (`app/routes/`, `src/routes/`, `pages/`, `views/`), then `package.json` scripts and README/docs flows. Cap at 20 flows, primary flows first.
5. Emit the `## Smoke Plan` to session context: one numbered item per feature -- feature name, route/URL, action steps, expected observable outcome.

Then:

1. Execute the plan immediately -- no confirmation between plan and execution. Use Playwright MCP safe tools only (`navigate`, `click`, `fill`, `snapshot`, `screenshot`).
2. Record per-feature PASS/FAIL/SKIPPED with evidence in session context `## Smoke Test`, plus an aggregate line. Continue past failures.

Arguments: optional feature filter (substring or route path) to narrow the inventory.
