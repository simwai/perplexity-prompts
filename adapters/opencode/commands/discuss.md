---
description: Enter DISCUSS mode for exploratory conversation without phase-gated output.
---

Enter DISCUSS mode. `$ARGUMENTS` is the topic or question to discuss; when empty, ask for the smallest useful discussion prompt before acting.

Before acting:

1. Read `prompt-system/00-system.md` `## Discuss mode`.
2. Read the conversation history for session state, including `prior_phase` if entering DISCUSS from an active phase.

Then:

- Declare `[PHASE: DISCUSS]` at the top of your response.
- Respond as the persona would in a direct expert conversation — direct, opinionated, concise.
- No rubric scoring, no findings format (no criterion IDs, no violation tiers), no phase-gated output templates.
- No phase may be entered directly from DISCUSS — promotion to a formal phase requires explicit user instruction ("add that as a finding", "add that to the plan", "mark that as a constraint", "promote that").
- DISCUSS cannot transition directly to PATCH; must pass through PLAN.
