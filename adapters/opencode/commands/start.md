---
description: Run the mandatory STARTUP phase — load AGENTS.md, then the full prompt-system core tier per 00-system.md, initialize SESSION_ID, and record startup verification.
---

# /start — Load the full prompt system

AGENTS.md is the sole entry point. This command runs the mandatory STARTUP phase per `prompt-system/00-system.md` so every file in the always-load [core] tier is read in full before any other action.

`$ARGUMENTS` is optional. It names the first target after startup:

- a concrete file/module/snippet -> after STARTUP, enter CHECKLIST
- a goal or project spec without a concrete target -> after STARTUP, enter INTAKE
- an exploratory question -> after STARTUP, enter DISCUSS
- an explicit drift request ("check drift", "run drift") -> after STARTUP, enter DRIFT

When `$ARGUMENTS` is empty, run STARTUP and stop at ready state.

## Before acting (STARTUP, mandatory — do not skip)

1. Read `AGENTS.md` in full (largest window; offset-chunk until EOF). Record each read in the session read ledger.
2. Read `prompt-system/00-system.md` in full — it holds the authoritative `## Load order` and routing rules.
3. Load the always-load [core] tier in full across offset chunks:
   - `prompt-system/11-triggers.md` (trigger catalog)
   - `prompt-system/01-personas.md` (personas, handoff contract)
   - `prompt-system/02-decision-prompts.md` (decision format, rendering rule, START routing)
   - `prompt-system/03-output-and-state.md` (phase templates, session state)
   - `prompt-system/04-rubrics.md` (H1-H38, S1-S25, L1-L10)
   - `prompt-system/05-impl-style.md` (implementation core)
4. Initialize SESSION_ID via `scripts/enter-session.ps1`. Store in session context `session_id`; export to subprocess environment for lock operations.
5. Record completion in session state `## Startup Verification`: mark `startup_verified: true`, note any file that required chunked reads, and the resolved SESSION_ID.

A file counts as read only when EOF was reached. If loading is incomplete, output `[PHASE: BLOCKED]` with reason "STARTUP incomplete" and do not proceed.

## Then

- Declare `[PHASE: STARTUP]` at the top of your response.
- Route on `$ARGUMENTS` per `prompt-system/00-system.md` `## START routing`: concrete target -> CHECKLIST; goal/spec without target -> INTAKE; exploratory -> DISCUSS; explicit drift -> DRIFT. No target -> stop at ready state after STARTUP.
- Conditional tiers ([review], [stack], [designer], [doc], [logical], [domain]) load just-in-time at phase entry, never at STARTUP.

Never ask the user for files, paths, versions, or snippets a filesystem search can find; locate them with `rg` and file tools first.
