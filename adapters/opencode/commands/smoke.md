---
description: Build a Playwright MCP smoke-test plan covering all features and execute it immediately
---

Execute a full-feature Playwright MCP smoke test against this repository's web app. This document is the complete protocol: no other prompt-system file needs to be read before acting.

## 1. Locate the web app (bounded: 4 tool calls)

Find the entry point from these sources only: root or workspace `package.json` `dev`/`start` scripts, `vite.config.*`/`nuxt.config.*`, a root `index.html`, or a documented localhost URL in README/QUICKSTART/AGENTS docs. Record the client URL and port, the API server URL and port if the stack is split, and whether the app is auth-gated.

If no web-app entry point exists, report `SKIPPED: smoke -- no web-app entry point detected` and stop.

Other SKIPPED branches: a confirmed READ_ONLY host, or the Playwright MCP server not preflighted (see `11-triggers.md` `## T-14` for the shared vocabulary).

## 2. Start the stack (app lifecycle)

Long-running process handling follows the start/wait_ready/smoke/stop protocol in `prompt-system/14-app-lifecycle.md` (trigger T-27). Read that file now; its steps bind this step.

- `app_lifecycle.start`: launch every required process in the background (client, and the API server when the stack is split). Record each PID and its expected startup time.
- `app_lifecycle.wait_ready`: poll a health endpoint, ready log pattern, or TCP port until each process is ready, with a timeout of expected startup time plus 30s. A timeout is a FAIL of the smoke run, not a retry loop.
- Auth bootstrap, before the plan is written: when the app is auth-gated, find credentials in `.env.example`, seed scripts, or the README. Never invent credentials and never create throwaway accounts.
- Record the started state in session context `## Smoke Run` (PIDs, ready evidence, authenticated role).

## 3. Derive the inventory as role-based user stories (cap 20, primary first)

Roles come from evidence, never from assumption. Find them in route guards and middleware (`role`, `requireRole`, `canActivate`, `isAdmin`), role enums or seed rows in the database, seeded accounts in `.env.example`, and README/docs mentions ("admin panel", "user dashboard"). When no role evidence exists, use the single role `user`.

Build the story inventory in this priority order, because later stories depend on earlier ones:

1. **Auth workflows per available role** -- "As a user, I want to log in, so that I can reach my dashboard", and the same for the admin role when one exists. Auth runs first per role.
2. **Core workflows for the primary role** -- create, read, and update flows of the primary domain objects, in create -> read -> update order.
3. **Admin workflows** -- only when an admin role exists and seed credentials for it exist; cover the admin-only routes from the route table.
4. **Route rendering** -- remaining reachable routes not already covered as a detail page of a covered object.
5. **Error and empty states** -- as stories ("As a user, I want to see a helpful message when the request fails, so that I know what to do next"), only when reachable in 3 steps or fewer.

A role with no usable seed credentials is recorded once as `SKIPPED -- <role>: no seeded credentials` and all of that role's stories are skipped as a block. Never partially attempt a role you cannot authenticate as.

## 4. Write the smoke plan (per-item schema)

Emit `## Smoke Plan` to session context. Every item carries all eight fields; an item missing a field is rewritten before execution:

- `role` -- the story's role, from step 3's evidence
- `id` -- short slug prefixed with the role (`user-login`, `admin-approve-item`)
- `feature` -- the story sentence verbatim: `As a <role>, I want to <capability>, so that <value>`
- `url` -- absolute entry URL for the workflow
- `preconditions` -- auth state, seeded data, feature flags, all taken from `.env.example`, seeds, or README
- `steps` -- ordered Playwright actions (`navigate`, `fill`, `click`) targeting elements by role, label, or text from the live page
- `expect` -- one observable assertion proving the story's value was delivered: matching visible text, resulting URL, element count, or banner text. "Loads", "works", and "renders correctly" are not expectations.
- `teardown` -- how the item leaves clean state, or `none`

Example item for a login-gated Vite client on :4001 with an API on :30000:

```txt
- role: user
  id: user-login
  feature: As a user, I want to log in, so that I can reach my dashboard
  url: http://localhost:4001/login
  preconditions: seed credentials from .env.example for the user role
  steps: fill email -> fill password -> submit
  expect: dashboard heading visible and URL no longer /login
  teardown: none
```

## 5. Execute immediately (no confirmation between plan and execution)

Playwright MCP safe tools only: `navigate`, `click`, `fill`, `snapshot`, `screenshot`. Never `browser_run_code_unsafe`.

Record per-item PASS/FAIL/SKIPPED with evidence in session context `## Smoke Test`, plus an aggregate line at the end. Continue past failures; a failed story never aborts the run.

- PASS requires one concrete artifact: a snapshot containing the expected text, a screenshot, or a URL match.
- FAIL records actual versus expected, never "did not work".
- SKIPPED records the reason: flow is destructive and no disposable seed account exists; the workflow needs data with no producer in the dev environment (payment webhooks, email delivery); the flow needs third-party OAuth redirect without test credentials in `.env.example`; the flow needs a role the run does not authenticate as; or the role has no seeded credentials.
- Console messages at `error` level during a story count toward FAIL for any story whose expectation is a rendered state. Check once per story with `browser_console_messages`, not per action.

If the inventory exceeds 20 stories, the first 20 in priority order execute and the dropped remainder is listed as "not executed -- cap".

## 6. Stop the stack

Send the documented shutdown (kill the recorded PIDs) and record each exit code. Never leave dev servers running after the run.

Arguments: `$ARGUMENTS` -- optional feature filter (substring or route path) narrows the inventory.
