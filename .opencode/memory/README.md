# Memory Worth MCP Server

Persistent agent memory with trust signals, invalidation, and self-tuning.

## Architecture

The package is a multi-file TypeScript module under `.opencode/packages/memory-worth/`:

```text
memory-worth/
  mcp-server.ts         -- MCP stdio entry point (single live surface)
  mcp-tools.ts          -- MCP tool adapter (13 tools + memory_list_tools)
  tools/                -- OpenCode tool registrations
    memory-write.ts     -- store with applies_when, scope-based routing
    memory-search.ts    -- free-text search with project/global scope
    memory-get.ts       -- retrieve by ID with scope enforcement
    memory-synthesize.ts-- combine multiple memories with citations
    memory-wakeup.ts    -- session-start digest with synthetic session id
    memory-stats.ts     -- health dashboard with scope filtering
    memory-delete.ts    -- permanent delete
    memory-update.ts    -- update content (preserves trust)
    memory-invalidate.ts-- mark as invalidated with reason/mode
    memory-merge.ts     -- merge two memories
    memory-set-status.ts-- set lifecycle status
    memory-tune.ts      -- adjust tuning knobs with rationale
    types.ts            -- shared LegacyToolDefinition type
  db/                   -- database access
    connection.ts       -- libsql client factory (machine-level DB, WAL)
    schema.ts           -- 3NF schema with migration 4 (project, last_activity_at, import_log)
    migrate.ts          -- migration runner
    queries.ts          -- shared data-access helpers
    decode.ts           -- libsql value decoding
    epoch.ts            -- seconds-based time (SECONDS_PER_DAY)
    identity.ts         -- project identity resolution
  core/                 -- pure ES2022 business logic
    types.ts            -- domain types
    prng.ts             -- seeded PRNG
    trust.ts            -- trust scoring
    governance.ts       -- invalidation, merge, status, tune, stats
    invalidation.ts     -- invalidation observation
    result.ts           -- Result<T, E> error idiom
    calibration.ts      -- calibration metrics
  runtime/              -- Node/Bun abstraction layer
    detect.ts           -- runtime detection
    shell.ts            -- shell command execution
    shim/               -- path/env/process shims
```

## Database

- Path: `%LOCALAPPDATA%\memory-worth\memory.db` by default (Windows) or `$XDG_DATA_HOME/memory-worth/memory.db` / `~/.local/share/memory-worth/memory.db`
- Override: `MEMORY_WORTH_DB` (full path) or `MEMORY_WORTH_HOME` (directory); `MEMORY_WORTH_DIR` deprecated alias
- Driver: `@libsql/client`
- Schema: 3NF with lookup tables, no JSON columns; migration 4 adds `episode.project`, `episode.last_activity_at`, `import_log`
- Concurrency: WAL mode + `busy_timeout=5000` for safe multi-host access

## Cross-runtime

Runs on Node.js via `npx tsx`. The `runtime/` layer absorbs runtime differences; `core/` modules are pure ES2022.

## Sim Harness

The simulation harness lives at `opencode-memory-mw/sim/` as a separate Node-only package.

## Tools

1. `memory_search` -- free-text search with trust labels; `scope: auto|project|global|all`
2. `memory_get` -- retrieve by ID with scope enforcement
3. `memory_synthesize` -- combine multiple memories with citations
4. `memory_wakeup` -- session-start digest; returns synthetic session id
5. `memory_write` -- store new memory; `applies_when` required; `scope: auto|project|global`
6. `memory_update` -- update content (preserves trust)
7. `memory_invalidate` -- mark as invalidated with reason/mode
8. `memory_merge` -- merge two memories
9. `memory_delete` -- permanent delete
10. `memory_set_status` -- set active/archived/invalidated/merged
11. `memory_stats` -- calibration, discrimination, distribution; `scope: auto|project|global|all`
12. `memory_tune` -- adjust tuning knobs with rationale
13. `memory_list_tools` -- list available tools

## Routing

- Write routing (`memory_write`): `auto` (default) routes grounded content to the current repo; ungrounded convention/reference memories go to shared `global`. Explicit `project` or `global` overrides.
- Read routing (`memory_search`, `memory_synthesize`, `memory_stats`, `memory_get`): `auto` searches current project + global, ranked current-first.

## Session Identity

MCP has no hooks, so session ids are synthetic: `memory_wakeup` resolves env > arg > open episode within 60 min > minted `auto-<yyyymmdd-HHmm>-<6rand>`, and touches `last_activity_at`.

## Logging

No `console.log` in plugin code; all logging through the MCP tool result channel.
