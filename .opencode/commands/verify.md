---
description: Verify an approved patch using the mutation-capable Build agent; record verification in SESSION_STATE.md.
agent: build
---

Run BabaDev verification after a patch or before finishing implementation work. This command is intentionally Build-scoped and is not a read-only inspection boundary. Optional focus: $ARGUMENTS.

Before acting:
1. Read `SESSION_STATE.md` if present.
2. Inspect `git status` and `git diff`.
3. Detect available project checks from package scripts, Makefile, pyproject, or docs (lint, typecheck, test).

Then:
- Summarize the diff at a high level.
- Run the smallest relevant check set. Do not invent commands.
- If no checks exist, say so explicitly.
- Update `SESSION_STATE.md` Verification fields.
- Emit results under the current phase header (usually PATCH) using the Verification section from module 07.
