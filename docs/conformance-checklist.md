# Conformance Checklist

Use this checklist when changing the protocol itself. It is intentionally
tool-independent because the core system is a specification, not an application.

- [ ] A concrete target enters `CHECKLIST`; a goal without a target enters the
      optional ScrumMaster pipeline.
- [ ] `DIRECT` is not confused with skipping upstream planning.
- [ ] Model-decided phase skips auto-advance without a confirmation prompt; the skip reason is recorded.
- [ ] Missing prerequisites produce only `BLOCKED`.
- [ ] Consolidated review records every file and batch before aggregate output.
- [ ] Aggregate findings remain provisional until explicit confirmation.
- [ ] A mismatched or foreign-session state file (`SESSION_STATE-<session_id>.md`)
      cannot restore old approval; approval requires target + scope + session_id match.
- [ ] Session state is per-session: each session owns its own state file, cleans
      up only its own file, and never deletes another session's; stale-file GC
      runs only at fresh-session init with a named TTL and never touches the
      current session's file.
- [ ] Each persona handoff contains only the fields required by its receiver.
- [ ] PATCH requires explicit approval and all four rewrite-contract fields.
- [ ] `[ ]` checkboxes in phase artifacts are flipped to `[x]` only when their status field
      reflects completed work; no phase advances and no PATCH concludes with an unticked box.
- [ ] Every file edit sequence ends with the project's lint run on the touched files;
      auto-fixable issues are fixed, remaining violations fixed or explicitly recorded,
      and no step concludes with an assumed-clean pass.
- [ ] Before each code edit, `14-implementation-style.txt` defaults are consulted and
      applied, in DIRECT and PATCH alike.
- [ ] End-of-session commit/push runs through the module-33 gate: the user is
      asked first, staging is limited to the session's edited files, remote
      URLs are never printed, and per-remote push failures are reported
      without becoming protocol failures.
- [ ] Tester guidance is classified as binding, strong hint, or weak hint.
- [ ] The agent never asks the user to provide files, paths, versions, or snippets
      discoverable in the local filesystem; it searches first with `rg` (fallback
      `grep`) and file tools (module 32).
- [ ] MCP packages are version-pinned or their update policy is documented.
- [ ] Portable deployment and OpenCode adapter scope are documented consistently.
