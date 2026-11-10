# Backlog

Roadmap: [ROADMAP_2026_09.md](ROADMAP_2026_09.md)
Backend: `file` per [CONFIG.md](CONFIG.md).

## Milestone map

- M1-trust -- Trust labels real -- DoD: `trust_label` reflects population quantiles, partition blending re-ranks -- items: RM-01, RM-02
- M2-proof -- Proven live + self-governing -- DoD: temp-dir round-trip passes, idle sweep invalidates per `shouldInvalidate` -- items: RM-03, RM-04
- M3-validate -- Sim validates policy -- DoD: `sim/run.ts` sweep produces oracle verdict report, synthesize write-path opt-in works -- items: RM-05, RM-06

## Items (sorted by ICE, highest first)

- RM-03 -- Temp-dir live database round-trip test covering write/search/outcome/stats without touching the prod DB -- M2-proof -- S -- ICE 9*9*7 = 567 -- DoD: round-trip test passes against an empty temp dir without touching `.opencode/memory.db`
- RM-01 -- Wire population quantile query plus partition-aware blending into `searchMemories` so `trust_label` stops reporting neutral -- M1-trust -- S -- ICE 9*8*6 = 432 -- DoD: `trust_label` returns non-neutral quantiles on seeded data
- RM-06 -- Opt-in synthesize write path reusing `writeMemory` so `memory_synthesize` drafts can persist or merge through -- M3-validate -- XS -- ICE 6*7*9 = 378 -- DoD: synthesize write path is opt-in and persists drafts through `writeMemory`
- RM-02 -- Blend per-partition EMA score with global score at retrieval re-rank for `task_type`-scoped queries -- M1-trust -- S -- ICE 8*7*6 = 336 -- DoD: `task_type`-scoped search order differs per partition EMA where expected
- RM-05 -- `sim/run.ts` CLI runner driving synthetic outcome sequences through regimes into oracle verdicts plus report output -- M3-validate -- S -- ICE 6*8*7 = 336 -- DoD: runner produces an oracle verdict report for a synthetic outcome sweep
- RM-04 -- Idle-hook governance sweep applying `shouldInvalidate`/`computeStatus` across stale rows for archival/invalidation -- M2-proof -- S -- ICE 8*6*6 = 288 -- DoD: sweep invalidates or archives stale rows per `shouldInvalidate`

Ties broken by size (smaller first), then by milestone target date: RM-02 before RM-05 at ICE 336.

## Split candidates (L size or multiple deliverables)

- None -- no L-size items, no multi-deliverable items; split rule satisfied (per the roadmap split check).

## Out of scope this roadmap

- D6 v4.1 `memories.db` importer (data reset accepted), D7 LLM-judged outcomes (regex carried over), D9 session evaluation (no subtask runner).
