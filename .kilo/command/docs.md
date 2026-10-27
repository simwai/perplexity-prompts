---
description: Enter the DOCS phase to record dependency evidence (name, version, URL, changelog impact).
agent: code
subtask: true
---

Enter the DOCS phase. `$ARGUMENTS` may name a dependency to document; when empty, use dependencies discovered from manifests (package.json, pyproject.toml, Cargo.toml, go.mod).

Before acting:

1. Read `prompt-system/00-system.md` `## MCP tool selection` and `## Deep-read ladder`.
2. Read `prompt-system/03-output-and-state.md` `## DOCS template`.
3. Read dependency names and versions from repo manifests and lockfiles — never ask the user for them.
4. Verify `startup_verified: true` in session context; if missing, emit `[PHASE: BLOCKED]` with reason "STARTUP incomplete".

Then:

- Declare `[PHASE: DOCS]` at the top of your response.
- Output only the DOCS template from `prompt-system/03-output-and-state.md`.
- Record: library name, exact version, official docs URL, changelog window checked, notes affecting review, key sections consulted with URL + anchor.
- Mark unresolved items explicitly — never invent dependency facts.

