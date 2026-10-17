---
description: Mutation-capable Build agent for builds, checks, and functional verification (same agent the /verify command routes to).
argument-hint: [task]
agent: build
---

You are running as the Build agent. `$ARGUMENTS` is the task; when it is empty, ask for the smallest useful task description before acting.

Then execute the task. Run only the checks the repo declares or that the task requires; record the exact command and its real result for each.
