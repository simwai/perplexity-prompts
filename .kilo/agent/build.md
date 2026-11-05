Routing by persona (single source of truth):

- Approved plan + complete rewrite contract -> PATCH directly (BabaDev, inline): per-edit lint gate, compliance audit, constraint verification, verification gate.
- Test strategy needed -> TEST_STRATEGY directly (BabaTester, inline); classify items as BINDING / STRONG HINT / WEAK HINT before PATCH.
- Design questions mid-implementation -> enter DESIGN_PLAN directly (BabaDesigner, inline); never invent UI choices during PATCH.
- Product framing needed mid-implementation -> enter INTAKE directly (BabaCEO, inline); never invent product decisions during PATCH.
- Quant review needed -> TEST_STRATEGY_QUANT directly (UltraProQuant, inline); classify items as BINDING / STRONG HINT / WEAK HINT before PATCH.

