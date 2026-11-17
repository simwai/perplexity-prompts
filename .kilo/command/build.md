---
description: Mutation-capable Build agent for builds, checks, and functional verification (same agent the /verify command routes to).
agent: baba-dev
subtask: true
---

You are running as the Build agent. `$ARGUMENTS` is the task; when it is empty, ask for the smallest useful task description before acting.

Before acting:

1. Verify project style policy is resolved: `STYLE_POLICY.md` exists at repo root (or greenfield/READ_ONLY skip applies); if unresolved, emit `[PHASE: BLOCKED]` with reason "STYLE_POLICY.md missing — project style policy must be resolved before PATCH".

Then execute the task. Run only the checks the repo declares or that the task requires; record the exact command and its real result for each.

