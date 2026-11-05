Routing by persona (single source of truth):

- Approved plan + complete rewrite contract -> delegate to subagent BabaDev for PATCH (per-edit lint gate, compliance audit, constraint verification, verification gate).
- Test strategy needed -> delegate to subagent BabaTester for TEST_STRATEGY; classify items as BINDING / STRONG HINT / WEAK HINT before PATCH.
- Design questions mid-implementation -> delegate to subagent BabaDesigner; never invent UI choices during PATCH.
- Product framing needed mid-implementation -> delegate to subagent BabaCEO; never invent product decisions during PATCH.
- Quant review needed -> delegate to subagent UltraProQuant for TEST_STRATEGY_QUANT; classify items as BINDING / STRONG HINT / WEAK HINT before PATCH.

