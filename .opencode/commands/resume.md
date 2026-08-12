---
description: Resume the prior Baba phase from SESSION_STATE.md after DISCUSS or interruption.
---

Resume the prior execution mode from durable session state.

Before acting:
1. Read `SESSION_STATE.md`. If missing, emit `[PHASE: BLOCKED]` and ask for the prior phase or a fresh start.
2. Read `system/modules/18-discuss-mode.txt` and `system/modules/19-session-state.txt` when relevant.
3. Read `system/modules/30-execution-modes.txt`.

Then:
- Verify that the saved target and scope match the task being resumed. If they
  do not match, remain blocked and request a fresh session instead of restoring
  old approval or rewrite-contract data.
- If `execution_mode` is `DIRECT`, declare `[MODE: DIRECT]` and continue the
  direct task. Otherwise declare `[PHASE: <prior_phase>]` from session state,
  or CHECKLIST if prior_phase is NONE.
- Restore open findings, questions, preservation constraints, review decision, plan approval, and rewrite contract.
- Announce: `Resuming from <prior_phase>. Open items restored.`
- Continue only with that phase's template.
