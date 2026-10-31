# 14-app-lifecycle

Long-running app start/smoke/shutdown protocol. Loaded on demand when a session starts, stops, or smoke-tests a dev server, worker, or daemon (trigger T-27 in `prompt-system/11-triggers.md`). Extracted from `prompt-system/07-protocols.md` during the load-tier split.

## App lifecycle

When a session involves starting, stopping, or smoke-testing a long-running process (dev server, worker, daemon), the lifecycle is:

- `app_lifecycle.start`: spawn the process in the background; record the PID; record the expected startup time.
- `app_lifecycle.wait_ready`: poll a health endpoint or log pattern until the process is ready, with a timeout equal to the expected startup time plus 30s.
- `app_lifecycle.smoke`: run the configured smoke check (HTTP probe, library import, entry-point call) against the running process. Record PASS/FAIL/SKIPPED.
- `app_lifecycle.stop`: send the documented shutdown signal; wait for exit; record the exit code. On a `READ_ONLY` host, every step reports `SKIPPED -- <reason>`.

Smoke runs once per PATCH at the Verification gate. It is not retried per edit.

### Startup validation

- Validate required environment variables and configuration before binding ports, accepting traffic, starting workers, or opening durable resources.

- Distinguish required settings from optional settings and define safe defaults only for settings that are genuinely optional.

- Treat a missing, malformed, contradictory, or wrong environment/config file as a startup error. Exit non-zero instead of starting in a partial or silently degraded state.

- Report the exact setting or file that failed and the expected shape, but never include secret values, credentials, or full environment contents in errors.

- Keep `.env.example` and equivalent configuration documentation aligned with the required startup contract.

### Graceful shutdown

- Handle the runtime's termination signals through one idempotent shutdown path.

- Stop accepting new work before draining in-flight requests, jobs, or message handlers.

- Close application resources in dependency order, including servers, worker pools, database connections, queues, and telemetry exporters where present.

- Bound draining and cleanup with a shutdown timeout. A clean drain may exit successfully; a forced timeout must be observable and exit non-zero.

- Prevent new background work from being scheduled after shutdown begins.

- Make repeated shutdown signals safe: the first signal starts cleanup and later signals must not run cleanup concurrently or corrupt state.

### Review checks (app lifecycle)

- Startup validation occurs before externally visible side effects.

- Invalid configuration cannot produce a successful-looking partial start.

- Shutdown behavior is testable for clean drain, timeout, repeated signals, and resource cleanup.

- Error output remains useful without exposing secrets or internal sensitive state.

### Close-session protocol

A session ends in one of three ways:

1. **Explicit command**: user types `/close`.
2. **Natural language**: user says "close the session", "end session", or "close session".
3. **Automatic**: the commit/push gate completes in PATCH and the user makes a commit/push decision (A/B/C). This is the default close trigger for sessions that made edits.

When any close trigger fires:

- Record `closed_at`, `closed_by`, `mode_at_close`, `final_commit`, `working_tree`, and `note` in the session context (conversation carrier) `## Session Close` section.

- If the session made edits and a commit was recorded, the close is automatic after the commit/push gate outcome is written.

- If the session made no edits, or the user invoked `/close` or natural-language close explicitly, evaluate whether a close-session evaluation is warranted:
  - Structured sessions with phase artifacts (CHECKLIST onward) -> run evaluation.
  - Trivial exploratory sessions with no phase artifacts -> skip evaluation; record `evaluation_skipped_reason`.

- Run the close-session evaluation by spawning a `task` sub-session with `subagent_type: baba-reviewer` using the evaluation prompt from `prompt-system/03-output-and-state.md` `## Session evaluation prompt`.

- Append the evaluation result to the session context `## Session Close` section.

- Announce close to the user: session ID, final commit (if any), evaluation verdict (PASS/FAIL/SKIPPED), and one-line summary.

Note: the automatic-close trigger procedure itself is canonical in `06-misc.md` `### Auto-close after commit/push`; this section carries the evaluation and recording steps.
