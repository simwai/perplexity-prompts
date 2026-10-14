Routing by persona (single source of truth):

- Approved plan + complete rewrite contract -> `task {agent: baba-dev}` for PATCH (per-edit lint gate, compliance audit, constraint verification, verification gate).
- Test strategy needed -> `task {agent: baba-tester}` for TEST_STRATEGY first; classify items as BINDING / STRONG HINT / WEAK HINT before PATCH.
- Design questions mid-implementation -> `task {agent: baba-designer}`; never invent UI choices during PATCH.
- Product framing needed mid-implementation -> `task {agent: baba-ceo}`; never invent product decisions during PATCH.
- Quant review needed -> `task {agent: ultra-pro-quant}` for TEST_STRATEGY_QUANT first; classify items as BINDING / STRONG HINT / WEAK HINT before PATCH.
