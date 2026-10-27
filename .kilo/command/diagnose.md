---
description: Dump the current session's diagnostic state (phase, mode, read ledger, edited files, gate results, struggle indicators) without changing anything.
agent: code
subtask: true
---

Diagnose the current session state. This command is read-only: it never edits files, runs mutating commands, or changes phase. Optional focus: $ARGUMENTS.

Before acting:

1. Read the session context from the conversation carrier (resolved per `prompt-system/03-output-and-state.md` `## Session State (In-Session Only)`).
2. Read `prompt-system/00-system.md` `## Phase model` and `## Loop protection` `### Read ledger` for the field definitions.

Then emit a single diagnostic block under the current phase header (or `[PHASE: DISCUSS]` if no phase is active). The block must contain, in this order:

- **Session identity**: session id (or "unset"), host capability (FILE_CAPABLE / READ_ONLY + evidence), persona.
- **Phase state**: `current_phase`, `last_valid_phase`, `mode`, `startup_verified`, `phase_status`, `prior_phase` (if set), and any recorded struggle indicators.
- **Read ledger**: planned count, completed count, deferred count, and the list of pending/deferred file paths (or "none"). Flag any file whose status is `pending` while its phase has already advanced past CHECKLIST.
- **Edited files**: the full `## Edited Files` list (one path per edit step) or "none -- no edits recorded". If non-empty, also report the per-edit lint result recorded for each step.
- **Plan approval**: recorded approval (target + scope + session_id + spec_version) or "none"; note any mismatch against the current task that would make it stale.
- **Rewrite contract**: present/absent; if present, list the four sub-fields (target, must-preserve, must-eliminate, forbidden) and their counts.
- **Commit/Push Gate**: decision, commit sha + subject, per-remote push results, Plan-Actual verdict, Playwright smoke result, or "N/A -- no edits / gate not run".
- **Plan-Actual history**: number of retries logged and the last verdict, or "none".
- **Degraded execution**: any recorded subagent fallbacks, or "none".
- **Struggle indicators**: full `## Struggle Indicators` block, or "none".

Rules:

- Read-only. Do not run git commands that mutate state; `git status --short` is acceptable for confirming the working tree, but never `git add`, `git commit`, `git push`, or `git reset`.
- Do not invent values. If a field is absent from the carrier, report it as "unset" rather than guessing.
- If the carrier itself is missing or invalid, report `BLOCKED`-style output naming the missing fields; do not fabricate a diagnostic.
- Keep the output concise: one line per field, grouped by section. No narrative padding.

After emitting, append a one-line note to the session context `## Reinforcement Log`-adjacent diagnostic record: `diagnose: <timestamp> -- <count> fields reported`.
