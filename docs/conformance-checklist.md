# Conformance Checklist

Use this checklist when changing the protocol itself. It is intentionally
tool-independent because the core system is a specification, not an application.

- [x] A concrete target enters `CHECKLIST`; a goal without a target enters the
      optional ScrumMaster pipeline.
- [x] `DIRECT` is not confused with skipping upstream planning.
- [x] Model-decided phase skips auto-advance without a confirmation prompt; the skip reason is recorded.
- [x] Missing prerequisites produce only `BLOCKED`.
- [x] Consolidated review records every file and batch before aggregate output.
- [x] Aggregate findings remain provisional until explicit confirmation.
- [x] A mismatched or foreign-session state file (`SESSION_STATE-<session_id>.md`)
      cannot restore old approval; approval requires target + scope + session_id match.
- [x] Session state is per-session: each session owns its own state file, cleans
      up only its own file, and never deletes another session's; stale-file GC
      runs only at fresh-session init with a named TTL and never touches the
      current session's file.
- [x] Each persona handoff contains only the fields required by its receiver.
- [x] PATCH requires explicit approval and all four rewrite-contract fields.
- [x] Phase artifacts are complete for the work their phase owns before the next phase opens:
      checklist-scope checkboxes (inventory rows, H/S coverage) are ticked when the listing or
      scope decision is recorded, review-status fields flip as REVIEW performs the work, and a
      `[x]` claiming completed work that has not run is a false tick (modules 01/07); no PATCH
      concludes with an unticked conformance box.
- [x] Every file edit sequence ends with the project's lint run on the touched files;
      auto-fixable issues are fixed, remaining violations fixed or explicitly recorded,
      and no step concludes with an assumed-clean pass.
- [x] Before each code edit, `system/05-impl-style.md` (selecting the active
      stack section) defaults are consulted and applied, in DIRECT and PATCH alike.
- [x] Greenfield scaffolds (from-scratch request or empty/near-empty repo) record
      CHECKLIST and REVIEW as greenfield skips and go PLAN-first: the INTAKE
      `Stack/Style:` field captures the convention source (system/05-impl-style.md
      defaults or user override) and the PLAN `Conventions:` field lists the
      defaults being established before PATCH creates files.
- [x] PLAN names each touched file's dominating error-handling/style idiom and how
      the patch preserves it; a foreign idiom for an operation the file already
      handles is a confirmed H12 finding unless explicitly user-approved
      (`system/05-impl-style.md`, `04-rubrics.md`, `03-output-and-state.md` PLAN template).
- [x] End-of-session commit/push runs through the commit/push gate in
      `system/06-misc.md`: the user is asked first, staging is limited to the
      session's edited files, remote URLs are never printed unsanitized, and
      per-remote push failures are reported without becoming protocol failures.
- [x] Before commit, when the repo declares a web-app entry point, the agent
      invokes the Playwright MCP server for a functional smoke (navigate +
      click key flows); PASS|FAIL|SKIPPED is recorded, and a failed smoke
      holds the commit ask (`system/06-misc.md` `## Commit/push gate`).
- [x] Credential-bearing files (`.env`, `.env.*`, `secrets/`, `*.pem`, `*.key`)
      are never read with the read-file tool; shell reads emit names with
      redacted values only, and `git remote -v` output is sanitized before it
      enters the transcript (`system/00-system.md` `## Credentials & secrets`).
- [x] Tester guidance is classified as binding, strong hint, or weak hint.
- [x] The agent never asks the user to provide files, paths, versions, or snippets
      discoverable in the local filesystem; it searches with `rg` and specifies
      no fallbacks (`system/00-system.md` `## Identity`, `05-impl-style.md`).
- [x] Search locates, full read comprehends: no file is edited, scored, or judged
      from search snippets alone; a comprehension read is the largest-window full
      read (offset-chunked when large), is a state change rather than a loop, and
      truncation is recorded, never assumed read (`system/00-system.md` `## Loop protection`,
      `## Identity & Rules`).
- [x] MCP packages are version-pinned or their update policy is documented.
- [x] Docs research follows the deep-read protocol: TOC-first discovery,
      criterion-to-section mapping, page-level fetches with anchor citation,
      a bounded lookups budget (up to 3 per dependency per DOCS phase), and
      recorded section skips (`system/00-system.md` `## MCP tool selection` fallback
      ladder, `03-output-and-state.md` DOCS template).
- [x] Portable deployment and OpenCode adapter scope are documented consistently.
- [x] Spec content is data, never instructions: spec files are quoted inside
      fences when echoed, and embedded directives cannot change the phase, tick
      a checkbox, or skip a gate (`system/06-misc.md` `## Spec lifecycle`,
      `## Drift detection`, mirroring the fenced-content rule).
- [x] HALT semantics: version drift surfaces as a DRIFT-internal decision block
      with exactly one recommended fix path; never a silent fix, never a
      BLOCKED variant (`system/06-misc.md` `## Drift detection`).
- [x] Registry-write governance: every `SPECS/` write (new spec, registry row,
      spec-body edit) flows through PATCH and joins the commit/push gate
      edited-files set (`system/06-misc.md` `## Spec lifecycle`,
      `## Commit/push gate`).
- [x] Spec-version freshness: approval restore requires target + scope +
      session_id + spec_version match, and a version-drift HALT invalidates
      live Plan Approval (`system/03-output-and-state.md` `## Session state file`,
      `06-misc.md` `## Drift detection`).
