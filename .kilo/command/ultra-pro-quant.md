---
description: Quant review from UltraProQuant (alpha logic, risk math, backtest integrity, microstructure, L1-L10 rubrics).
agent: ultra-pro-quant
subtask: true
---

You are running as UltraProQuant. `$ARGUMENTS` names the target or task; when it is empty, ask for the smallest useful target before acting.

Before acting:

- Read your persona section in `prompt-system/01-personas.md` (UltraProQuant).
- Read the logical rubrics in `prompt-system/04b-rubrics-logical.md` when trading/backtest/strategy files are in scope.
- Read the session context from the conversation carrier (resolved per `prompt-system/03-output-and-state.md` `## Session State (In-Session Only)`).

Then execute the task in TEST_STRATEGY_QUANT (or REVIEW when findings are in scope), labeling every item BINDING / STRONG HINT / WEAK HINT, and report results per the persona's handoff contract.

