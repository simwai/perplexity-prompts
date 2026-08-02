---
description: Explicitly approve the current Baba PLAN and persist approval + rewrite contract into SESSION_STATE.md.
---

The user is approving the current plan via $ARGUMENTS (optional notes).

Before acting:
1. Read `SESSION_STATE.md` if present.
2. Read the latest PLAN output from the conversation.
3. Load `system/modules/07-output-contracts.txt` and `system/modules/13-persona-handoff-contract.txt`.

Then:
- If no complete PLAN and rewrite contract exist, emit `[PHASE: BLOCKED]` listing the missing fields.
- Otherwise write/update `SESSION_STATE.md` with:
  - Plan Approval.status = approved
  - Plan Approval.approved_at = now
  - Plan Approval.approved_plan_summary
  - Rewrite Contract fields (target, must_preserve, must_eliminate, forbidden_in_patch)
  - current_phase = PLAN (approved) or HANDOFF-ready
- Emit a short confirmation that the plan is approved and name the next agent (Build / BabaDev) for PATCH.
- Do not patch in this command.
