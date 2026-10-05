# PATCH Protocol

This file is a pointer. It is no longer the source of truth for PATCH
behaviour or the commit/push gate.

**Canonical source: [`prompt-system/06-misc.md`](../../prompt-system/06-misc.md)**

## What was recovered from this file

This copy was the only place the **leftover-audit detail** existed. Canonical
`## Leftover Handling` was two lines long; it now carries the full protocol,
recovered from here:

- `### Categories` -- temp files (with the OS temp-directory exemption) and
  uncommitted legacy `SESSION_STATE-*.md` session artifacts.
- `### Procedure (auto-delete at PATCH verification gate)` -- the ordered
  Detect / Delete / Record / Gate steps, plus the `## Leftover Audit` reporting
  template.

The 13 `<MUST>`-tagged gates this copy carried were also restored to canonical,
which had the rules as unemphasised prose. Twelve were restored; the thirteenth
was deliberately not, because it gated on session-file-lock acquisition for a
feature that has since been removed.

## Why this file is a pointer

Everything else here was either a rewording or stale:

- The residual line differences are cosmetic. This copy writes "the session
  context (conversation carrier)" where canonical writes "the session context".
- It still spawned a `/subtask` for the close-session evaluation. That command no
  longer exists; canonical uses `task` with `subagent_type: baba-reviewer`.
- It still documented `SESSION_STATE-*.md` as a live carrier artifact. Session
  state is now conversation-only.

`AGENTS.md` deploys only `AGENTS.md` plus `prompt-system/`. PATCH protocol that
lives outside `prompt-system/` is protocol that never reaches a target project.

## Related

- `prompt-system/06-misc.md` -- PATCH protocol, gates, commit/push gate, leftover handling
- `prompt-system/03-output-and-state.md` -- PATCH phase template and rewrite contract
- `prompt-system/08-plan-actual-gate.md` -- the Plan-Versus-Actual Gate
- `prompt-system/rules.md` -- H13-H38 detection and enforcement
