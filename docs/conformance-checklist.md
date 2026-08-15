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
- [ ] A mismatched `SESSION_STATE.md` cannot restore old approval.
- [ ] Each persona handoff contains only the fields required by its receiver.
- [ ] PATCH requires explicit approval and all four rewrite-contract fields.
- [ ] `[ ]` checkboxes in phase artifacts are flipped to `[x]` only when their status field
      reflects completed work; no phase advances and no PATCH concludes with an unticked box.
- [ ] Every file edit sequence ends with the project's lint run on the touched files;
      auto-fixable issues are fixed, remaining violations fixed or explicitly recorded,
      and no step concludes with an assumed-clean pass.
- [ ] Tester guidance is classified as binding, strong hint, or weak hint.
- [ ] The agent never asks the user to provide files, paths, versions, or snippets
      discoverable in the local filesystem; it searches first with `rg` (fallback
      `grep`) and file tools (module 32).
- [ ] MCP packages are version-pinned or their update policy is documented.
- [ ] Portable deployment and OpenCode adapter scope are documented consistently.
