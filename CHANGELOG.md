# Changelog

All notable changes to `simwai/perplexity-prompts` are documented here.
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- Output language rule: every response is written in English regardless of the
  user's input language, in any mode, phase, or persona. Added as the first
  rule in the `## Identity & Rules` section of `AGENTS.md` (above the existing
  conciseness and no-emoji rules), so it is inherited by every target repo via
  `sync.ps1` without a per-persona or per-phase restatement.

- Review-drift remediation pass (consolidated review 2026-08-26): `AGENTS.md`
  rubric range corrected to H1–H12 / S1–S13 (both mentions) and the removed
  "use the full token budget" rule replaced by the module-01 continuation rule,
  plus a startup note recording that opencode pins all always-loaded modules
  while other hosts load them through model diligence; dangling module-02
  references fixed in `modules/17-cross-team-requirements.txt` (now modules
  01/07) and `modules/35-spec-lifecycle.txt` (now modules 01/08); module 05 S11
  Python upgrade note aligned to H10's function-signature scope;
  `modules/07-output-contracts.txt` CHECKLIST coverage semantics extended to
  the documented soft-tier extension IDs (`S-artifact`, `S-gitattributes`,
  `S-precommit`, modules 15/16); `docs/conformance-checklist.md` rows ticked
  after verification against the current module set.
- Token-cost refactor of the always-loaded base stack (standing context ~96 KB
  to ~71 KB): `modules/01-orchestrator.txt` now merges the former
  `02-workflow.txt` and `11-state-machine.txt` (phase model, transition rules,
  hard guards, recovery) into one module; the "use the full available token
  budget" rule is removed and replaced by a continuation rule; the verbatim
  always-loaded base-stack list is dropped from persona modules 23-27 and the
  routing table; `modules/14-implementation-style.txt` is split into
  `14-core.txt` plus per-stack modules (`14-ts.txt`, `14-py.txt`, `14-java.txt`,
  `14-frontend.txt`, `14-ps.txt`, `14-pine.txt`) so only the active stack loads;
  `modules/34-fileless-mode.txt` is no longer always-loaded — it loads only on a
  confirmed `READ_ONLY` host (module 12 read-only trigger), and the fileless
  branches in `06-fix-and-patch-protocol.txt`, `07-output-contracts.txt`,
  `25-babadev.txt`, `30-execution-modes.txt`, and `33-commit-and-push-gate.txt`
  are reduced to one-line pointers into module 34; `modules/19-session-state.txt`
  template is slimmed to the standing field set with optional sections appended
  only while their owning surface is active. Synced: `bootstrap.txt`,
  `docs/AGENTS-usage.md`, `docs/conformance-checklist.md`, `.opencode/agents/`.
- Dead-path cleanup: `modules/12-module-routing.txt` now loads
  `03-docs-research.txt` at CHECKLIST (the checklist's pre-review docs log
  records library/version/URL, which the docs protocol defines — previously it
  was only loaded one phase later at DOCS); the untracked stray
  `node-4IhTfWZ9.js` was deleted; `targets.json`'s role as `sync.ps1`-only
  operational tooling is documented in the script header and in
  `modules/33-commit-and-push-gate.txt` (never a remote source for the gate);
  module paths in `.opencode/agents/baba-dev.md` and `baba-reviewer.md` are
  normalized to the `system/modules/` prefix.

- Greenfield style binding: when the target is a from-scratch project or a repo
  with no existing source files, the module-14 defaults become the project
  conventions (stack, DI container, error idiom, naming, file naming, structure,
  region tags) until the user overrides them. `modules/14-implementation-style.txt`
  gains a Greenfield projects section (defaults are binding there, not merely
  "strong defaults"); the INTAKE template in `modules/07-output-contracts.txt`
  and `modules/22-scrum-planning.txt` gains a `Stack/Style:` field; the PLAN
  template's `Conventions:` field covers new files/new projects; `.opencode/agents/plan.md`
  loads module 14 and `modules/24-babasensei.txt` requires module-14 conventions in
  greenfield plans; `modules/02-workflow.txt` and `modules/10-decision-and-intake.txt`
  add the greenfield branch (CHECKLIST/REVIEW recorded skips, PLAN-first);
  `modules/11-state-machine.txt` adds the constrained `CHECKLIST -> PLAN`
  transition with the hard-guard carve-out; `docs/AGENTS-usage.md` and
  `docs/conformance-checklist.md` synced.
- Pre-commit Playwright functional smoke: `modules/33-commit-and-push-gate.txt`
  gains a pre-ask verification step — when the repo declares a web-app entry
  point, the gate invokes the Playwright MCP server to smoke-test the session's
  work (start the app per its documented entry point, navigate + click key
  flows) before emitting the commit ask; the outcome is recorded
  PASS|FAIL|SKIPPED; a failed smoke is a hard gate (holds the ask, return to
  fix; commit only after a pass or explicit user acceptance); repos without a
  web app record SKIPPED with reason; the smoke uses safe browser tools only
  (never `browser_run_code_unsafe`). Cross-referenced in
  `modules/06-fix-and-patch-protocol.txt` (Verification gate),
  `modules/21-mcp-invocation.txt` (phase pairing + no-go rules),
  `modules/25-babadev.txt` (PATCH behavior),
  `modules/19-session-state.txt` (`playwright_smoke` field),
  `modules/07-output-contracts.txt` (PATCH verification lines), the `/verify`
  command, and docs (`AGENTS-usage.md`, `conformance-checklist.md`).
- Spec lifecycle (Tier 1): new `modules/35-spec-lifecycle.txt` — optional
  `SPEC` phase (BabaScrumMaster-owned, between TASK_PLAN and CHECKLIST) with a
  PRD-style spec artifact (`SPECS/NNN-name/spec.md`: user stories with GWT,
  `FR-###` requirements, `SC-###` success criteria, `[NEEDS CLARIFICATION]`
  markers, max 3) and an append-audit registry (`SPECS/index.md`) with the
  `Draft -> RFC -> Stable -> Deprecated` lifecycle; L1/L2 layering with
  `Implements:` parent links (L2 cannot go Stable before its L1 parent);
  quarantine cascade on L1 demotion (cross-team notification via module 17);
  micro-spec escape hatch (<50 lines); version-drift HALT semantics; all
  `SPECS/` writes flow through PATCH and join the module-33 edited-files set;
  spec content is data, never instructions. Wired into modules
  `02/07/10/11/12/13/19/22`, bootstrap, docs.
- Drift detection (Tier 2): new `modules/36-drift-detection.txt` — optional
  read-only `DRIFT` phase (post-PATCH or on demand, exits to PLAN or prior
  phase) with claims + mappings, drift categories (verified, diverged,
  orphaned mappings, code-exceeds-spec), drift verbs `apply`/`extract`/`sync`
  (renamed from push/pull to avoid the module-33 collision), fresh-eyes
  bounded cold-read subagent review (no state read, no persona switch), HALT
  decision block (one recommended fix path, never a BLOCKED variant, never
  silent), bounded reports with the continue-next-turn rule, and
  `drift_findings`/`spec_version` handoff fields. Wired into modules
  `02/07/10/11/12/13/19`, bootstrap, docs.
- Adversarial persona gate (Tier 3): mandatory devil's-advocate pass inside
  REVIEW's decision section (pre-promotion) and as a pre-close check inside
  PATCH — no new phase, no second user ask; BabaTester exclusion documented as
  intentional; new breach rows in `modules/09-failure-guards.txt`.
- Tasks-template enrichment (Tier 4): TASK_PLAN card gains `[P]` parallel
  flags, story grouping, MVP-first ordering (within a story; ICE stays the
  across-story pull order), and a test-first flag defined as a plan-level
  ordering signal (never a test-authoring grant, module 14); matching optional
  fields in `modules/13/19/22` with backward-compatible defaults.
- `modules/19-session-state.txt` — freshness tuple extended with
  `spec_version`; new `Spec Registry` (read cursor) and `Drift Report`
  sections, optional-with-default so legacy adoption and `/resume` never
  BLOCK; HALT invalidates live Plan Approval mid-session.
- `docs/conformance-checklist.md` — four new invariants (spec-as-data, HALT
  semantics, registry-write governance, spec-version freshness); docs synced
  (`architecture.md`, `AGENTS-usage.md`).

- Pine Script single-line style: `modules/14-implementation-style.txt` gains a
  Pine Script defaults section: every statement on a single physical line;
  never break inside a ternary chain or a function call's argument list (Pine's
  continuation rules are fragile there and cause `end of line without line
  continuation` errors); break lines only where Pine requires indented block
  bodies; refactor unwieldy statements into intermediate variables or
  `if`/`else` blocks instead of wrapping; comments go on their own line above
  the statement.
- Comprehension-before-judgment rule: `modules/32-filesystem-first.txt` gains a
  "Search locates, full read comprehends" section — a grep hit is a slice, not
  understanding; a file must be read in full (largest window, offset-chunked
  when large) before it is edited, scored, or judged, with truncation recorded
  honestly; `modules/31-loop-guards.txt` gains a "Comprehension reads are not
  loops" carve-out (offset-chunked full reads are distinct fingerprints and
  state changes, never doom loops); `modules/30-execution-modes.txt` sharpens
  DIRECT's understand-the-target rule with the same full-read requirement;
  `AGENTS.md` and `docs/conformance-checklist.md` synced.
- Deep-read protocol for official docs: `modules/03-docs-research.txt` now
  requires TOC-first discovery, criterion-to-section mapping, a bounded
  deep-dive budget (up to 3 targeted lookups per dependency, matching the
  context7 harness cap), page-level fetches with anchor citation, and recorded
  section skips; `modules/21-mcp-invocation.txt` replaces the one-call-per-gap
  rule with the bounded budget and extends the fallback ladder with TOC ->
  section -> anchor steps; the DOCS template in `modules/07-output-contracts.txt`
  gains `Key sections consulted` and `Sections skipped` fields.
  `docs/AGENTS-usage.md` and `docs/conformance-checklist.md` synced.
- Cross-language error-handling idiom consistency: `modules/14-implementation-style.txt`
  gains an all-stacks rule (the idiom dominating a file wins; importing another
  idiom for an operation the file already handles is a confirmed H12 finding;
  deliberate idiom changes require explicit user approval) and a `PowerShell
  defaults` section pinning pwsh 7.6 (never Windows PowerShell 5.1) and
  documenting `$LASTEXITCODE` guard-and-return as the version-proof native
  failure pattern, with `$PSNativeCommandUseErrorActionPreference` semantics
  (7.3 experimental / 7.4 stable, default `$false`) and the pwsh 7.2+
  redirected-stderr note.
- `modules/04-review-rubric-hard-tier.txt` — new hard-tier criterion H12
  (idiom consistency); usage line updated so H1–H10 and H12 apply per chunk.
- `modules/07-output-contracts.txt` — PLAN template gains a mandatory
  `Conventions:` field; CHECKLIST hard-tier line now covers H1–H12.
- `modules/30-execution-modes.txt` — local-conventions rule extended from
  DIRECT-only to STRUCTURED PLAN/PATCH, cross-referencing modules 14/07.
- `docs/AGENTS-usage.md` and `docs/conformance-checklist.md` synced.
- Sanitized-output security rules: `git remote -v` may run only with sanitized
  output — credentials redacted and verified absent before entering the
  transcript (module 33, replacing the outright ban; the gate still lists
  remotes by name only) — and credential-bearing files (`.env`, `.env.*`,
  `secrets/`, `*.pem`, `*.key`) are never read with the read-file tool, only
  via shell commands emitting names with redacted values (module 32,
  cross-referenced from module 15). Two new breach conditions in module 09
  enforce both rules protocol-wide; `docs/AGENTS-usage.md` and
  `docs/conformance-checklist.md` synced.
- `modules/33-commit-and-push-gate.txt` — end-of-session commit/push gate: when
  a session made file edits (end of PATCH after verification, end of DIRECT
  work), the agent asks the user first (A. commit+push / B. commit / C. skip),
  stages only the session's edited files (new append-only `Edited Files` ledger
  in module 19, fed by the per-edit lint-gate recording points in modules 06
  and 30), and pushes to `origin` then every `*-mirror` remote with duplicate-URL
  skip and per-remote continue-and-report. Remote URLs are never printed —
  `.git/config` URLs embed live credentials (H1). No force-push, no destructive
  git ops; two new breach conditions in module 09; gate state restores via
  `resume.md`; wired into 12-module-routing (always-loaded), bootstrap,
  06/25/30/07/16, opencode agents and commands, and docs.
- `modules/32-filesystem-first.txt` — filesystem-first rule: agents never ask the
  user to provide files, paths, versions, or snippets discoverable in the local
  filesystem; content search prefers `rg` over `grep`. Cross-referenced from
  `10-decision-and-intake.txt`, `07-output-contracts.txt`, `08-interaction-layer.txt`,
  `30-execution-modes.txt`, `00-persona-system.txt`, `23-babascrummaster.txt`,
  `25-babadev.txt`, `18-discuss-mode.txt`, `22-scrum-planning.txt`,
  `19-session-state.txt`, `03-docs-research.txt`, and `docs/AGENTS-usage.md`.
- Safer OpenCode defaults: the loader is explicitly configured, MCP packages are
  version-pinned, and planning is the default native agent.
- Architecture and protocol conformance guides for maintainers and students.
- `modules/14-implementation-style.txt` -- added a File naming section (per-stack filename conventions, test-file naming, case-collision and extension rules) and expanded the Project structure section (root config and scripts placement, test layout choice,
  kebab-case directories, frontend layer names). Per-stack sections cross-reference the File naming section instead of duplicating rules.
- `modules/30-execution-modes.txt` — adaptive `AUTO`, `DIRECT`, and `STRUCTURED` routing with explicit low-risk direct execution and safety-preserving verification.
- OpenCode `/direct`, `/structured`, and `/auto` commands for overriding adaptive mode selection.
- `modules/00-persona-system.txt` — always-loaded persona overview and recommended session flow (content moved out of bootstrap).
- OpenCode native Plan/Build overrides: `.opencode/agents/plan.md` (BabaSensei, read-only) and `.opencode/agents/build.md` (BabaDev, approval-gated).
- OpenCode commands: `/approve-plan`, `/handoff`, `/resume`, `/verify` under `.opencode/commands/`.
- `SESSION_STATE.md` fields for review decision, plan approval, and verification results.
- BabaDev PATCH verification gate: inspect diff, run relevant project checks when available, record results.
- `modules/28-app-lifecycle.txt` — startup validation, fail-fast configuration errors, and bounded graceful shutdown guidance.
- `modules/29-library-selection.txt` — value density, maintenance, security, type safety, dependency footprint, migration, and distribution-aware license selection criteria.
- Restructured into a one-file + one-folder deployable layout: `bootstrap.txt`, `modules/`, and `personas/` moved under `system/`; `AGENTS.md` is now a slim entry pointer with a Deploy section. `README.md`, `docs/AGENTS-usage.md`, and `.pre-commit-config.yaml` updated to the new paths.
- Personas are now modules: `system/personas/` removed, personas moved into `system/modules/` as `23-babascrummaster.txt`, `24-babasensei.txt`, `25-babadev.txt`, `26-babatester.txt`, `27-babareviewer.txt`. The deployable unit is now just `bootstrap.txt` + `modules/`.
  `AGENTS.md`, `README.md`, `docs/AGENTS-usage.md`, and `modules/12-module-routing.txt` updated to the new layout. Session flow folded into `bootstrap.txt`.
- `modules/21-mcp-invocation.txt` — decision guidance for when to invoke each MCP: signal-to-tool matrix, phase pairing, no-go rules (built-ins first, one call per evidence gap, no secrets through remote endpoints), and keyless web-search fallback via direct curl to Google's URL format.
- `modules/20-database-conventions.txt` — recreated the missing file referenced by module routing, extracted from the Database conventions section in `bootstrap.txt`.
- Registered `21-mcp-invocation.txt` as always-loaded in `modules/12-module-routing.txt`.
- MCP set change: removed GitHub, GitLab, and Google Search MCP servers (plus `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITLAB_PERSONAL_ACCESS_TOKEN`, `GOOGLE_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID`); added Trello (remote OAuth, `https://mcp.trello.com/v1`) and Playwright (`npx -y @playwright/mcp@latest`).
- `AGENTS.md`, `docs/AGENTS-usage.md`, and `README.md` updated to reflect the new MCP set and the curl-based Google search fallback.
- `bootstrap.txt` — added Tool Sourcing section pointing to `modules/21-mcp-invocation.txt`.
- `modules/13-persona-handoff-contract.txt` — structured handoff contract that any persona must emit before another persona may begin. Defines required payload fields, receiving-persona validation rules, and the HANDOFF template.
- `modules/15-artifact-handling.txt` — LLM instructions for artifact hygiene: what counts as an artifact, `.gitignore` authoring rules, committed-credential H1 violation, and REVIEW/PLAN/PATCH enforcement.
- `modules/16-pre-commit-behavior.txt` — LLM instructions for pre-commit reasoning: formatter-first order (`prettier --write` / `ruff format`), linter second, explicit `tsc --noEmit` for TypeScript, secret scanner as H1-adjacent, broken hook as hard-tier blocker.
- `modules/17-cross-team-requirements.txt` — LLM instructions for cross-team handoffs: when and how to write `CHANGES_REQUIRED.md`, mandatory entry template, priority definitions, and audit-trail rules.
- `modules/18-discuss-mode.txt` — LLM instructions for the `DISCUSS` phase: protocol-free expert conversation mode, entry/exit triggers, promotion rules for carrying conclusions into formal phases.
- `modules/19-session-state.txt` — LLM instructions for `SESSION_STATE.md`: temp per-session state file spec, read/write rules, mid-session persona switch protocol, cleanup rule.
- `modules/11-state-machine.txt` — added `DISCUSS` to the phase set; added `ANY PHASE -> DISCUSS` and `DISCUSS -> <prior_phase>` transitions; added hard guards for DISCUSS.
- `modules/12-module-routing.txt` — added `TEST_STRATEGY` and `HANDOFF` phase routing; added `DISCUSS` phase routing (modules 18 + 19); added conditional loading of modules 15, 16, 17; added multi-persona session additions (modules 13 + 19).
- `bootstrap.txt` — added discussion-only session type; added Step 3 multi-persona script with DISCUSS handling; added Step 4 mid-session persona switch script; updated ownership rules for modules 13, 18, 19.
- `opencode.jsonc` — opencode-native config: `instructions` auto-loads `AGENTS.md` and `system/bootstrap.txt`; `mcp` registers context7, tavily, playwright, exa (`{env:EXA_API_KEY}`), and trello (remote OAuth). Inert for non-opencode agents; `AGENTS.md` + `system/` remain the portable deploy unit.
- `.opencode/agent/baba-scrummaster.md`, `baba-sensei.md`, `baba-dev.md`, `baba-tester.md`, `baba-reviewer.md` — the five personas as opencode agents (`mode: primary`). `edit: deny` on all but `baba-dev`. Each references `system/modules/` instead of duplicating persona content.
- `.opencode/command/baba.md` (`/baba <persona>`) and `.opencode/command/phase.md` (`/phase <NAME>`) — opencode command entry points.
- `README.md` and `docs/AGENTS-usage.md` — document the optional opencode layer.
- `CHANGELOG.md` — this file.
- `.gitignore` — artifact exclusions for the repo itself, including `SESSION_STATE.md`.
- `.gitattributes` — normalize all text files to LF on commit and checkout (`* text=auto eol=lf`).
- `modules/15-artifact-handling.txt` — added `.gitattributes` authoring defaults, a review rule (missing or CRLF-forcing `.gitattributes` is a soft-tier finding), and a spawn rule (new repos get `* text=auto eol=lf`). House preference is LF for all text files, including on Windows.
- `modules/16-pre-commit-behavior.txt` — file-hygiene hook now covers LF line endings alongside trailing whitespace and end-of-file newline.
- `bootstrap.txt` — command-line and workflow defaults note the `.gitattributes` LF preference, cross-referencing module 15.
- `modules/31-loop-guards.txt` — loop protection for repeated identical read
  steps (doom loops): three consecutive identical read fingerprints with no
  state change are a protocol breach that stops or blocks, preventing
  loop-prone models (Grok-class) from draining the credit budget. Registered as
  always-loaded in `modules/12-module-routing.txt` and listed in `bootstrap.txt`.
- `opencode.jsonc` — `permission.doom_loop` set to `deny` (hard-stops three consecutive identical tool calls at the process level instead of the default `ask`) and `tool_output` limits (`max_lines`/`max_bytes`) added to cap oversized read output.
- `.opencode/agents/*.md` — per-agent `steps` caps added (`build.md` 100, `plan.md` 50, `baba-*.md` 40) so a looping agent is forced to text-only instead of looping on `Infinity`.
- `modules/09-failure-guards.txt` — added the repeated-identical-read breach condition (doom loop) to the protocol breach list.
- `modules/19-session-state.txt` — added the `Read Ledger` section (one fingerprint per read step) to make repeat detection durable across turns.
- `modules/21-mcp-invocation.txt` — added a no-go rule against re-invoking a lookup whose fingerprint already produced a result this session.
- `modules/30-execution-modes.txt` — DIRECT mode now forbids repeating an identical read step without a state change.

### Changed

- `opencode.jsonc` pins all ten always-loaded modules (`00`, `01`, `09`, `12`,
  `14-core`, `21`, `30`, `31`, `32`, `33`) via `instructions`, making module
  loading fully deterministic in every opencode session; the ~39 KB standing
  context cost was weighed against the token-cost refactor and accepted
  deliberately (2026-08-26). Stack modules stay diligence-loaded because they
  are language-dependent.
- Dangling `.opencode/plugin/session-header.ts` registration removed from
  `opencode.jsonc`; the orphaned `@opencode-ai/plugin` dependency was dropped
  from `.opencode/package.json` and the lockfile refreshed.
- Session state is now concurrency-safe: each session owns a session-scoped
  state file `SESSION_STATE-<session_id>.md` instead of a single shared
  repo-root `SESSION_STATE.md`. `session_id` resolves from a sanitized
  `SESSION_ID` env var (regex `^[A-Za-z0-9._-]+$`, path-traversal rejected),
  a conversation-remembered id, or a generated `<ISO timestamp>-<8 hex>` value
  (>= 8 hex entropy floor). Legacy bare `SESSION_STATE.md` files are consumed
  via an atomic rename on first init (the rename is the claim; a racing session
  falls back to fresh init) and their `Plan Approval` / `Rewrite Contract`
  fields are invalidated on adoption — a legacy file can never authorize work.
  Approval/rewrite-contract restore now requires target + scope + session_id
  match (`10-decision-and-intake.txt`, `19-session-state.txt`, `resume.md`,
  `baba.md`). Cleanup deletes only the session's own file; stale-file GC runs
  only at fresh-session init against a named `SESSION_STATE_TTL_DAYS = 7`
  constant, skips unparseable files, never touches the current session, and
  names deleted files. Read ledger and MCP preflight ledger persist per session.
  Module 19 is the single canonical source for resolution rules; all surfaces
  (modules 02/06/10/11/18/21/25/30/31/32, `.opencode/commands/*`,
  `.opencode/agents/*`, `docs/AGENTS-usage.md`, `docs/conformance-checklist.md`)
  reference it without re-description. `.gitignore` now also excludes
  `SESSION_STATE-*.md`.
- `system/bootstrap.txt` is now a **module loader only**; canonical rules live in `system/modules/`.
- Removed standalone `CONFIRM` phase. Core flow is `CHECKLIST -> DOCS -> REVIEW -> PLAN -> PATCH`. REVIEW owns the confirmation decision section.
- OpenCode discovery paths moved to documented plurals: `.opencode/agents/` and `.opencode/commands/`.
- Read-only Baba agents now deny both `edit` and `bash`.
- `opencode.jsonc` sets `default_agent: "plan"` (the read-only BabaSensei planning path) and continues auto-loading `AGENTS.md` + loader.
- `modules/12-module-routing.txt` and `modules/13-persona-handoff-contract.txt` — stale `GuidedSeniorDev` references aligned to `BabaDev`.
- `docs/AGENTS-usage.md` — added BabaScrumMaster to the Persona Reference table and the optional upstream pipeline to the Phase Flow.
- `AGENTS.md`, `system/`, and all shared modules remain portable and model-agnostic; the opencode layer adds no dependencies for other agents.
- Skipped phases now auto-advance: deterministic skips (`DOCS` when no docs-sensitive
  judgment is in scope, upstream ScrumMaster pipeline when a concrete target exists)
  transition straight to the next phase without a confirmation prompt; the skip and
  its one-line reason are recorded in the phase artifact and `SESSION_STATE.md`.
- Checkbox ticking is now mandatory and tied to status: every `[ ]` in a phase artifact
  must flip to `[x]` and match its `complete`/`reviewed` status field before the next
  phase opens, and `PATCH` cannot conclude with an unticked conformance box. A `[x]`
  on work still `pending` is a false tick and a protocol breach (`02-workflow.txt`,
  `07-output-contracts.txt`, `11-state-machine.txt`, `25-babadev.txt`,
  `docs/conformance-checklist.md`).
- Per-edit lint gate: every file edit sequence (one logical edit step: one file or a
  coherent batch changed in one go) now ends with the project's lint run on the touched
  files (formatter first, auto-fix, then manual fixes), with the exact command and its
  real result recorded per step and no assumed-clean pass allowed; the final verification
  gate still runs at the end (`06-fix-and-patch-protocol.txt`, `25-babadev.txt`,
  `30-execution-modes.txt`, `14-implementation-style.txt`, `07-output-contracts.txt`,
  `docs/conformance-checklist.md`).
- Module 14 (`14-implementation-style.txt`) is now always-loaded and its defaults are a
  mandatory pre-edit consultation gate: every code edit, in DIRECT and PATCH alike,
  applies module 14 style defaults before writing code (`12-module-routing.txt`,
  `bootstrap.txt`, `30-execution-modes.txt`, `06-fix-and-patch-protocol.txt`,
  `25-babadev.txt`, `01-orchestrator.txt`, `docs/conformance-checklist.md`).

### Removed

- Tavily MCP server removed across all surfaces: `AGENTS.md` Tier 1 block and
  description bullet, `opencode.jsonc` `mcp` entry, `.codex/config.toml`
  `[mcp_servers.tavily]` block, `modules/21-mcp-invocation.txt` signal matrix
  and pairing (web search now maps to `exa` / direct `curl`), `README.md` tool
  list, and `docs/AGENTS-usage.md` (tier table, key table, example config,
  verification snippet, security note, troubleshooting row). The AGENTS.md
  Tavily references were removed in the same pass (see the removed-Tavily
  entry above).
- `role-legend.md` — obsolete root-level role table, superseded by the Persona System section in `bootstrap.txt` and the persona modules. Was stale (five roles, missing BabaScrumMaster) and referenced nothing.
- `scripts/pre-commit-check.sh` and `scripts/pre-commit-check.ps1` — replaced with LLM instruction module 16. Removed entirely.
- `.pre-commit-config.yaml` — replaced with LLM instruction module 16. Stub file remains for reference.

### Fixed

- `modules/27-babareviewer.txt` — responsibilities line now reads H1–H10 instead of H1–H9; added a Terminal phase section clarifying the reviewer audits patches and never authors them.
- `modules/07-output-contracts.txt` — CHECKLIST template hard-tier line now lists H1–H10 instead of H1–H9.
- Persona modules 23–27 — module-loading sections de-duplicated: they now defer to `12-module-routing.txt` and list only persona-specific additions, eliminating the contradiction with the always-loaded set.
- `modules/16-pre-commit-behavior.txt` — Python pre-commit type check and detection now use `pyright` instead of `mypy`, matching the house stack.
- `modules/02-workflow.txt` — `DISCUSS` added to the Active phases list; `bootstrap.txt` phase diagram now annotates `DISCUSS`; `.opencode/command/phase.md` accepts `DISCUSS`.
- `modules/27-babareviewer.txt` — docs-skip reference corrected from `02-workflow.txt:59-60` to `02-workflow.txt:64`.
- `CHANGELOG.md` — merged duplicate `[Unreleased]` sections.
- CHECKLIST gate semantics: checklist-scope checkboxes (inventory rows, H1–H12,
  S1–S13) are now scope ticks recorded during CHECKLIST, while review-status
  fields flip during REVIEW — eliminating the deadlock where the CHECKLIST exit
  gate demanded review-complete ticks before REVIEW could open. Aligned across
  `modules/02`, `07`, `11`, `25` and `docs/conformance-checklist.md`.
- `modules/34-fileless-mode.txt` — registration note corrected (the module is
  always-loaded per module 12, not "not yet listed"); `playwright-smoke` added
  to the canonical SKIPPED category set (validating its use in modules 07/33);
  "no write step" wording clarified as post-confirmation.
- Stale enumerations corrected: modules `00`/`27` now cite H1–H12 and S1–S13;
  personas `23`–`27` base-stack lists now include modules 30–34; module `00`
  BabaScrumMaster terminal column is `TASK_PLAN -> HANDOFF (SPEC, when in scope,
  exits to CHECKLIST)`.
- `modules/11-state-machine.txt` — removed the orphan `BACKLOG -> SPEC`
  transition (SPEC is entered via `TASK_PLAN -> SPEC` in the upstream pipeline).
- BLOCKED template alignment: modules `10` (Stack Compatibility notice) and `13`
  (incomplete handoff) now match the module-07 BLOCKED field set.
- Wording and doc fixes: module `06` verification-gate smoke reference; module
  `22` SPRINT-skip path includes SPEC; module `17` delivered-content note; module
  `24` handoff fields include `excluded_violations`; changelog staleness
  (default_agent value, AGENTS.md Tavily line reference).

---

## [1.0.0] — 2026-05-17

### Added

- Updated `README.md` and `docs/AGENTS-usage.md` to support the MCP-enabled agent instructions.
- Initial release of the phase-oriented prompt system.
- Modules 01–12 and 14 covering orchestration, workflow, docs research, review rubrics (hard/soft), fix-and-patch protocol, output contracts, interaction layer, failure guards, decision-and-intake, state machine, module routing, and implementation style.
- Personas: `babasensei.txt`, `babatester.txt`, `guided-senior-dev.txt`.
- `AGENTS.md` synthesized overview for autonomous agent use.
- `bootstrap.txt` launcher guide.
- `role-legend.md` persona role table.
