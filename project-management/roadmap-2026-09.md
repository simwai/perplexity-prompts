# Roadmap 2026-09 - Memory Plugin Continuation

Source: `opencode-memory-mw/PLAN.md` Section 9 Deferred D1-D8, suggested order D1 -> D2 -> D5 -> D8 -> D4 -> D3.
Prior ship: commit `b2d2185` v4.2, 21/21 green on Bun and Node.
Backend: `file` per `project-management/config.md`.

## Milestones

- M1-trust -- Trust labels real -- DoD: `trust_label` reflects population quantiles, partition blending re-ranks.
- M2-proof -- Proven live + self-governing -- DoD: temp-dir round-trip passes, idle sweep invalidates per `shouldInvalidate`.
- M3-validate -- Sim validates policy -- DoD: `sim/run.ts` sweep produces oracle verdict report, synthesize write-path opt-in works.

## Backlog lane

- RM-01 -- Wire population quantile query plus partition-aware blending into `searchMemories` so `trust_label` stops reporting neutral. [M1-trust] [Size S, ~150-300 LOC touched: `db/queries.ts` 11KB, `core/trust.ts`, `core/core.test.ts`]
- RM-02 -- Blend per-partition EMA score with global score at retrieval re-rank time for `task_type`-scoped queries. [M1-trust] [Size S, ~150-250 LOC: `db/queries.ts` search path, `core/trust.ts`]
- RM-03 -- Add temp-dir live database round-trip integration test covering write/search/outcome/stats without touching prod DB. [M2-proof] [Size S, ~150-250 LOC new test, reuses `writeMemory`/`searchMemories`]
- RM-04 -- Add idle-hook governance sweep applying `shouldInvalidate`/`computeStatus` across stale rows for archival/invalidation. [M2-proof] [Size S, ~150-300 LOC: `hooks/`, `core/governance.ts`, `db/queries.ts`]
- RM-05 -- Add `sim/run.ts` CLI runner driving synthetic outcome sequences through regimes into oracle verdicts plus report output. [M3-validate] [Size S, ~150-300 LOC: `opencode-memory-mw/sim/` library exists, runner new]
- RM-06 -- Add opt-in synthesize write path reusing `writeMemory` so `memory_synthesize` drafts can persist or merge through. [M3-validate] [Size XS, ~50-150 LOC: `tools/memory-synthesize.ts`, `db/queries.ts`]

Out of scope this roadmap: D6 v4.1 `memories.db` importer (data reset accepted), D7 LLM-judged outcomes (regex carried over), D9 session evaluation (no subtask runner).

Split check: no L-size items, no multi-deliverable items, no split required per split rule.

## Planned lane

(empty)

## In Progress lane

(empty)

## Done lane

(empty -- v4.2 ship recorded in PLAN.md Section 8, not duplicated here)
