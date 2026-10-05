# Sprint 001 - Trust real + proven live

Roadmap: `project-management/roadmap-2026-09.md`
Sprint goal: make trust labels real in retrieval and prove the plugin live against a temp database.
Target date: 2026-10-05 (2 weeks from 2026-09-21).
Selection: raw goal order D1 -> D2 -> D5 per `opencode-memory-mw/PLAN.md` Section 10, all Size S, no split required.

## Selected items (from Backlog, in pull order)

- RM-01 -- quantile trust labels in `searchMemories` [M1-trust] [S]
- RM-02 -- per-partition EMA blending at re-rank [M1-trust] [S]
- RM-03 -- temp-dir live DB round-trip test [M2-proof] [S]

Deferred to next sprint: RM-04 (governance sweep), RM-05 (sim runner), RM-06 (synthesize write path).

## Board

- To do: RM-01, RM-02, RM-03
- In progress: none
- Done: none

## Completion criteria

- RM-01 `trust_label` returns non-neutral quantiles on seeded data.
- RM-02 `task_type`-scoped search order differs per partition EMA where expected.
- RM-03 round-trip test passes without touching `.opencode/memory.db`.

## Stories (parent item tagged, MVP tagged)

- ST-01 [P1] As a chat agent, I want search results ordered by population-calibrated trust so that stale or wrong memories stop surfacing. Given qualified memories with varied outcomes, When I call `memory_search`, Then top hits reflect quantile `trust_label`s. (parent RM-01, core)
- ST-02 [P1] As a chat agent, I want task-type partition scores blended into ranking so that domain-specific trust wins. Given per-partition EMA rows, When I search with `task_type`, Then partition score re-ranks results. (parent RM-02, core)
- ST-03 [P2] As a maintainer, I want a temp-directory database round-trip test so that write/search/outcome/stats are proven live. Given an empty temp dir, When the suite runs, Then write/search/outcome/stats pass without touching the prod DB. (parent RM-03, supporting)

## ICE (I*C*E, Ease from size band: XS 8-10, S 6-8, M 4-6, L 1-4)

- RM-01: 9*8*6 = 432 (S, Ease 6)
- RM-02: 8*7*6 = 336 (S, Ease 6)
- RM-03: 9*9*7 = 567 (S, Ease 7)
- RM-04: 8*6*6 = 288 (S, Ease 6, backlog only)
- RM-05: 6*8*7 = 336 (S, Ease 7, backlog only)
- RM-06: 6*7*9 = 378 (XS, Ease 9, backlog only)

Pull order by ICE: RM-03 (567), RM-01 (432), RM-06 (378), RM-02/RM-05 (336 tie, smaller first, then milestone date), RM-04 (288).
Task card: highest-ICE sprint story RM-03 / ST-03.
