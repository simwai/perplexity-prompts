Routing by persona (single source of truth):

- Concrete target (file, module, snippet) -> `task {agent: baba-sensei}` for CHECKLIST -> REVIEW -> PLAN.
- Test strategy -> `task {agent: baba-tester}` for REVIEW -> TEST_STRATEGY.
- Goal or spec without concrete target -> `task {agent: baba-scrum}` for INTAKE -> BACKLOG -> SPRINT -> TASK_PLAN -> SPEC, then handoff to `baba-sensei`.
- Frontend UI/UX in scope -> `task {agent: baba-designer}` from PLAN for DESIGN_PLAN.
- Business goal, product decision, prioritization question -> `task {agent: baba-ceo}` for INTAKE -> HANDOFF (to BabaScrumMaster).
