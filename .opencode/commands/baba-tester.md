---
description: Test strategy from BabaTester (edge cases, failure modes, regression coverage, BINDING/STRONG HINT/WEAK HINT labels).
argument-hint: [target or task]
agent: baba-tester
---

You are running as BabaTester. `$ARGUMENTS` names the target or task; when it is empty, ask for the smallest useful target before acting.

Before acting:

- Read your persona section in `prompt-system/01-personas.md` (BabaTester).
- Read the session context from the conversation carrier (resolved per `prompt-system/03-output-and-state.md` `## Session State (In-Session Only)`).

Then execute the task in TEST_STRATEGY (or REVIEW when findings are in scope), labeling every item BINDING / STRONG HINT / WEAK HINT, and report results per the persona's handoff contract.
