# Memory-Worth v4.2 — Full Plan

Persistent agent memory with trust signals, invalidation, and self-tuning, as an
OpenCode plugin that runs unmodified on Desktop (Node.js/Electron) and CLI (Bun).

Status snapshot: reconstructed from the approved implementation plan and the
session record at commit `b2d2185`. Items marked Done landed and verified
(scoped `tsc` clean, 21/21 tests green on Bun and Node). Items marked Deferred
were explicitly scoped out or discovered during implementation — section 9 is
where continuation starts.

## 1. Objective

RAG with a governance layer: the agent stores what it chooses, each memory
accrues associational trust (co-occurrence with success, partitioned by task
type), unhealthy memories are invalidated or archived, and the agent tunes its
own knobs through audited tools.

## 2. Architecture

```text
.opencode/plugins/memory-worth/
  index.ts          -- plugin entry point (hooks + tool map)
  prompt.ts         -- prompt-fragment builder
  outcome.ts        -- outcome classification helpers
  runtime/          -- Node/Bun abstraction (detect, shell, path/env/process shims)
  core/             -- pure ES2022: types, Result, seeded PRNG, trust, governance
  db/               -- libsql connection, 3NF schema, migrations, guarded queries
  tools/            -- 12 tool builders + shared DB accessor
  hooks/            -- chat injection, outcome recording, session lifecycle
opencode-memory-mw/sim/
  regimes.ts, policies.ts, oracle.ts, metrics.ts + regression suite
```

Done. Database lives at `.opencode/memory.db` (flat file, `@libsql/client`).

## 3. Tool surface (all 12 Done)

| Tool | Role | Status |
|---|---|---|
| `memory_search` | free-text search with trust labels | Done |
| `memory_get` | retrieve by ID | Done |
| `memory_synthesize` | multi-memory synthesis draft | Done (draft-only, see D3) |
| `memory_wakeup` | surface stale memories | Done |
| `memory_write` | store with near-duplicate guard | Done |
| `memory_update` | edit content, preserve trust | Done |
| `memory_invalidate` | exclude from search | Done |
| `memory_merge` | weighted EMA merge | Done |
| `memory_delete` | soft-delete | Done |
| `memory_set_status` | active/archived/invalidated/merged | Done |
| `memory_stats` | calibration, discrimination, flags | Done |
| `memory_tune` | one knob per call + rationale + audit | Done |

## 4. Hooks (Done, one deviation)

| Hook | Role | Status |
|---|---|---|
| `experimental.chat.system.transform` | capability guidance injection | Done |
| `tool.execute.after` | outcome detection → trust updates | Done |
| `event` (session.created/deleted) | seed params, cleanup ledger | Done |
| `experimental.session.compacting` | clear retrieval ledger, note context | Done |

Deviation: the spec asked for `chat.message` prompt injection, but the SDK
hook returns `void` and cannot modify prompts, so injection moved to
`system.transform` (static guidance) while query-specific retrieval stays
agent-driven via `memory_search`.

## 5. Database (Done)

3NF with lookup tables (`memory_status`, `task_type`, `tag`), link tables,
per-partition EMA rows, epoch-second `TEXT` timestamps, parameterized queries
only, atomic batches for multi-statement writes, FTS5 index with triggers,
normalized tuning audit (`tuning_audit` + `tuning_audit_entry`).

## 6. Runtime layer (Done)

No static `bun:*` imports, no top-level `Bun` access, guarded capability
checks. Shims delegate to `node:*`, which both runtimes support.

## 7. Sim harness (Done as library, runner Deferred)

Regime table (`nominal`/`watch`/`degraded`/`quarantine`), policy actions,
oracle health scoring, stability metrics — all unit-tested. No CLI runner or
regime-sweep report yet (see D4).

## 8. Verification (Done)

- Scoped `tsc --noEmit`: clean (41 files).
- Whole-project `tsc --noEmit`: clean after the user-directed
  `baba-protocol-enforce.ts` regex fix (was a pre-existing parse error).
- Regression suites: 21/21 on Bun direct, 21/21 on Node via emitted output.
- Markdown lint: clean on touched docs.
- Playwright smoke: N/A (no UI surface).

## 9. Deferred — where continuation starts

- D1. Quantile trust labels are not wired into search. `computeTrustLabel`
  exists but retrieval uses the global score, so `trust_label` currently
  reports `neutral` until the population query lands. Next: population query
  over qualified memories + partition-aware blending in `searchMemories`.
- D2. Per-partition score blending. `task_type` filters; per-partition EMA
  does not yet re-rank. Next: blend partition score with global score at
  retrieval time.
- D3. Synthesis is draft-only. `memory_synthesize` returns text; nothing
  writes or merges it through. Next: opt-in write path reusing `writeMemory`.
- D4. Sim harness has no runner. Library only — no CLI, regime sweep, or
  report output. Next: `sim/run.ts` driving synthetic outcome sequences
  through regimes into oracle verdicts.
- D5. No live-OpenCode integration test. Units cover pure logic; no plugin-load
  smoke or tool round-trip against a real database file. Next: temp-dir
  database round-trip test for write/search/outcome/stats.
- D6. No v4.1 database migration. Data reset was the accepted path. Next only
  if old memories matter: one-shot importer from `memories.db`.
- D7. Outcome detection is regex-heuristic. Carried over from v4.1; LLM-judged
  outcomes deferred. Next: optional judge hook behind a tuning flag.
- D8. No scheduled governance pass. Archival/invalidation is lazy (via
  `memory_wakeup`) or manual. Next: idle-hook sweep applying
  `shouldInvalidate`/`computeStatus` across stale rows.
- D9. Session evaluation skipped (no subtask runner on the host).

## 10. Suggested continuation order

D1 → D2 (trust labels become real, retrieval improves) → D5 (prove it live) →
D8 (governance runs itself) → D4 (sim validates policy changes) → D3, D6, D7
as needed.
