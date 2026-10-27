# Memory Worth Fix Plan

## Approved Design

Machine-level SQLite store at `%LOCALAPPDATA%\memory-worth\memory.db`, one `memory.project` column as the partition key, agent-driven capture via `memory_write` plus tool descriptions and `AGENTS.md`, automatic read routing `project IN (current, 'global')`, automatic write routing by grounding/token/type, session identity through `memory_wakeup` with `last_activity_at`, and WAL + `busy_timeout=5000` so opencode, Kilo, and desktop MCP clients do not collide on one file.

## Decisions

| Decision | Choice | Where recorded |
|---|---|---|
| Storage topology | A: single machine-level DB, `project` partition, one-time import | Stage 3 |
| Plugin disposition | A: delete opencode plugin path, MCP only | Stage 5 |
| Capture | A: agent-driven with measurement gate (`captures_last_7d`) | Stage 4 |
| `applies_when` | B: mandatory everywhere | Stage 4 |

## Evidence baseline

- Live DB `.opencode/memory.db`: `journal_mode=delete`, `busy_timeout=0`, schema v3, 3 memories all `project='default'`, `episodes: 0`, `calibration_entry: 0`, all `unproven`, sources `user,user,session`.
- Tuning split-brain: loader reads `trust_q 0.3 / doubt_q 0.3 / min_evidence 5 / active_partition "general"`; `memory_tune` maintains `0.70 / 0.30 / 3 / "auto"`.
- Dead surface: eight `*_legacy_v1` tables plus dead `memory_fts` FTS index; live path uses `memory_fts_v2`.
- Stray empty `.opencode/.opencode/memory.db` exists (cwd-drift fork), 0 rows.
- Test baseline: `64 pass / 0 fail / 4 cancelled`, exit 1; `session-flow` fails `PluginEntry is not a function`.

## Stage 0 -- Record baseline and back up live DB

Files touched: none on disk; copy `.opencode/memory.db` to `.opencode/memory.db.bak-<date>` in OS temp directory.
Gate: `npx tsx --test "packages/memory-worth/**/*.test.ts"` from `.opencode` -> `64 pass / 0 fail / 4 cancelled`, `memory_stats` -> `memories: 3, active: 3, unproven: 3, episodes: 0`.

## Stage 1 -- Defect fixes

Files touched:

- `db/epoch.ts`: add `SECONDS_PER_DAY` constant; `daysAgo` uses seconds.
- `db/queries.ts`: single tuning loader on `parameter`; `tuning_param_legacy_v1` read only as fallback when empty.
- `db/schema.ts`: migration 4 adds `episode.project`, `episode.last_activity_at`, `import_log`.
- `db/queries.ts`: project-aware dedupe at `findDuplicateFull`.
- Delete `.opencode/.opencode/memory.db` (verified 0 rows).
Gate: unit tests for epoch/tuning/dedupe green; full suite unchanged; `memory_stats` parity (still 3 rows).

## Stage 2 -- Project identity and routing modules

Files touched:

- `db/identity.ts` (new): `resolveProjectId(cwd)` = `MEMORY_WORTH_PROJECT` > git `host/owner/repo` (sanitized) > `basename@hash(absPath)` > `basename@hash(cwd)`, walking up `.opencode`/`.git` cwd drift; reserved `global`; `default` treated as legacy alias.
- `db/routing.ts` (new): write routing `project | global | auto`; read routing `project IN (current, 'global')` with `project_boost`; memory-type inference from `{convention, reference, decision, bugfix, error, note}`.
- `tools/memory-write.ts`: add `scope` arg (`auto|project|global`), derived `memory_type`/tags/grounds, response `{project, routing, reason, duplicate_of}`.
- `tools/memory-search.ts`, `memory-get.ts`, `memory-synthesize.ts`, `memory-wakeup.ts`, `memory-stats.ts`: add `scope` arg (`auto|project|global|all`).
Gate: table-driven URL tests including token-bearing remotes, ssh, no-git, `.opencode`-cwd; `memory_write` returns correct routing reason for grounded vs convention content.

## Stage 3 -- Storage relocation, migration 4, one-time import

Files touched:

- `db/connection.ts`: path resolution `MEMORY_WORTH_DB` > `MEMORY_WORTH_HOME` > `%LOCALAPPDATA%/memory-worth`; deprecate `MEMORY_WORTH_DIR`; `PRAGMA journal_mode=WAL`, `busy_timeout=5000`.
- `mcp-server.ts`: remove `process.cwd()` default (`:23`).
- Migration 4 + import script: attach legacy `<repo>/.opencode/memory.db`, copy memories/tags/grounds/episodes under resolved project id, record in `import_log`; skip if no legacy DB.
Gate: fresh temp home creates DB with WAL; import produces 3 rows under repo project id; second launch does not re-import; two concurrent writers do not collide.

## Stage 4 -- Tool surface, instructions, capture measurement

Files touched:

- `mcp-server.ts`: pass `instructions` string to `McpServer` constructor (SDK `ServerOptions.instructions`).
- `tools/memory-wakeup.ts`: resolve session id env > arg > open episode < 60 min > minted `auto-<ts>-<rand>`; return resolved id; touch `last_activity_at`; return `{session, digest, policy, pending}`.
- Tool descriptions rewritten as triggers (search before answering; capture after durable preference/decision/correction/fact).
- `memory_stats`: add `session_writes`, `captures_last_7d`.
- `AGENTS.md`: replace memory paragraph with behavior contract (search before answering when prior context helps; capture durable insights; never announce stored content; prefer updating over duplicating).
Gate: `memory_wakeup` returns a session id on cold start; `search` on unknown topic surfaces stale/unproven rows in `pending`; no capture against live DB during verification (use `memory_stats` only).

## Stage 5 -- Plugin deletion

Files touched:

- Delete `index.ts`, `hooks/`, `prompt.ts`.
- Move `LegacyToolDefinition` type out of `tools/v2-register.ts` before deletion (`mcp-tools.ts:29` imports it).
- Keep `mcp-server.ts`, `db/`, `core/`, `tools/` minus plugin-only deps.
- `package.json`: repoint `main` from `index.ts`.
Gate: `npm run typecheck` in `.opencode`; full suite exit 0; `rg memory_legacy_v1` returns nothing; `rg buildInjectionTexts` returns nothing outside tests.

## Stage 6 -- Docs and generated adapters

Files touched:

- Update `AGENTS.md:84-91`, `AGENTS_USAGE.md:87-97`, `user-guide/OPENCODE.md:67-77`, `.opencode/memory/README.md` to new path/scope/session contract.
- Edit `opencode.jsonc` MCP block if needed; run `generate-adapters.ps1` to regenerate `.mcp.json` and `kilo.json` (never hand-edit generated files).
Gate: markdownlint clean on touched `.md`; `git diff` on `.mcp.json`/`kilo.json` shows only expected generated changes.

## Stage 7 -- Live verification and capture measurement

Files touched: none (configuration env only).
Procedure: restart opencode; `memory_wakeup` returns a session id; write a project-agnostic convention from this repo; open another repo; `memory_search` finds it ranked below that repo's own rows; after one week of real use, inspect `captures_last_7d`. Above ~10/session keeps the plugin deleted; at or near zero, escalate to the capture-only hook plugin (decision remains open).
Gate: cross-project read works; no stale rows masked by dedupe across projects.

## Rollback

Rollback is restoring `.opencode/memory.db.bak-<date>` over `.opencode/memory.db` and reverting `mcp-server.ts` to read `process.env.MEMORY_WORTH_DIR || process.cwd()`. The legacy DB import is additive: it never mutates the source legacy file.
