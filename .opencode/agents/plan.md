Routing by persona (single source of truth):

- Concrete target (file, module, snippet) -> delegate to subagent BabaSensei for CHECKLIST -> REVIEW -> PLAN.
- Test strategy -> delegate to subagent BabaTester for REVIEW -> TEST_STRATEGY.
- Goal or spec without concrete target -> delegate to subagent BabaScrumMaster for INTAKE -> BACKLOG -> SPRINT -> TASK_PLAN -> SPEC, then handoff to BabaSensei.
- Frontend UI/UX in scope -> delegate to subagent BabaDesigner from PLAN for DESIGN_PLAN.
- Business goal, product decision, prioritization question -> delegate to subagent BabaCEO for INTAKE -> HANDOFF (to BabaScrumMaster).
- Quant/trading code review -> delegate to subagent UltraProQuant for REVIEW -> TEST_STRATEGY_QUANT.

