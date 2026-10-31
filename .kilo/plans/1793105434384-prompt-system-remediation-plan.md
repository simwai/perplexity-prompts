# Prompt-System Remediation Plan

## Goal

Fix the defects found by the 2026-10-27/28 architecture audit (19 delegated reviewers, all 38 system files reviewed) so that `AGENTS.md` + `prompt-system/` becomes: internally contradiction-free, cheap to load, mechanically validated, and cheap to extend. Ranked audit top-10, re-sequenced into dependency-safe phases.

This is the authorized governance session for `prompt-system/` changes (prompt-system protection rule). Implementation requires a file-capable agent; this plan was authored read-only.

## Guardrails (every phase)

- One phase = one commit-sized unit; phases are independently committable and stoppable.
- Every phase ends green: markdownlint on touched `.md`, all integrity suites (`pre-commit.ps1` step 4 list), plus new suites from Phase 1.
- After any edit to a canonical rule, exactly one file owns it; all other mentions become pointers.
- PS 5.1-compatible script syntax (no `&&`); UTF-8 no-BOM writes; stage only session-edited files; commit/push gate with the standard ask.
- Adapter outputs (`kilo.json`, `.mcp.json`, `.kilo/*`, `adapters/*`) are never hand-edited: fix the source (`opencode.jsonc`, `personas.json`, `generate-adapters.ps1`), then regenerate and diff-review.

## Phase 1 -- Guardrail harness first

Build the validators before refactoring the corpus. New suites ship with a temporary baseline allowlist (explicitly listed, decayed in later phases), so they pass today and tighten as fixes land.

1. Create `prompt-system/system-manifest.json` (single machine-readable registry): load-order file list with tier tags (always / review-patch / conditional), phase set + legal transition edges, trigger IDs T-01..T-24 + entry fields, rubric ID spaces H1-H38 / S1-S25 / L1-L10 (+ H20a-d), persona registry mirror (name, entryPhase), decision-format literal, `expect` vocabulary.
2. Extend `test-cross-reference-integrity.ps1`: assert every manifest load-order file exists (replace hardcoded lists); fail on missing scan dirs; drop ghost `docs\refs` scope; add `user-guide/` + `project-management/` to rubric-citation scan; fail (not warn) on phantom anchors beyond an allowlist.
3. Extend `test-rubric-id-integrity.ps1`: derive ID ranges + contiguity from the manifest; validate S and L IDs (today: none); fix `$ErrorActionPrefs` typo; fail uniformly on unregistered IDs including `.ts` scans; assert H20a-d presence in `rules.md`.
4. New `test-phase-graph.ps1`: every `A -> B` edge cited in prose (`00-system.md`, `07-protocols.md`, `11-triggers.md`) exists in the 00 legality table and vice versa; persona entry-phase mapping matches the manifest.
5. New `test-decision-format.ps1`: exactly one rendering literal corpus-wide (definition file allowlisted); REVIEW confirmation vocabulary (`A/B/C`, `skip`, `accept`) defined in `02-decision-prompts.md`.
6. New `test-registry-drift.ps1`: `personas.json` <-> `01-personas.md` sections <-> 00 bootstrap table <-> T-21 list agree (names, entry phases); no persona referenced by a command/agent file lacks a persona section.
7. Wire all new suites into `pre-commit.ps1` integrity list (lines ~242-245) and add `test-manifest-io.ps1` to the live list.

## Phase 2 -- Context economy and load contract

Measured today: pinned always-load = 11 files / ~45.6k words (~81% of corpus); documented core = ~29.8k. `opencode.jsonc:19-31` pins 06/07/08 despite `00-system.md:47-53` marking them PATCH-only; `kilo.json` is generated from it (`generate-adapters.ps1:646-666`).

1. Inspect `.opencode/plugins/baba-prompt-system-loader.ts` (blocks output until the phase's required set is read; discovers the set from the filesystem). Align its per-phase required-set logic with the new tiers before unpinning.
2. Define tiers in the manifest: always (AGENTS.md, 00, 02, 03, 11, 04, 05), review-patch (06, 07, 08, rules.md), conditional (04b quant, 09 designer, 10 `.md` edits, stacks by language).
3. Unpin 06/07/08 from `opencode.jsonc` instructions; regenerate `kilo.json`; update the stale `T-01..T-23` comment (line ~15).
4. Rewrite the STARTUP contract in `AGENTS.md` + `00-system.md`: initial load = always tier, offset-chunked reads allowed (61.5 KB single-read is impossible on capped readers); conditional tiers JIT-load at phase entry per the loader; scope `00:783` ("full read of all system files every response") to the loaded tier set; fix "only loadable system file at startup" wording; sync the AGENTS.md STARTUP block with `00:74-77` verbatim (incl. SESSION_ID init).
5. `AGENTS.md` deploy-story repair: move `ensure-playwright.ps1` / `ensure-uvx.ps1` into `prompt-system/scripts/` (or add an explicit copy-root-scripts deploy step); fix the memory-worth dead path note for deployed targets; make exa single-model (key via header; no-key fallback = g-search) in both AGENTS.md and 00; Context7 prose = remote HTTP only; complete the env table (SESSION_ID, BABA_READ_ONLY, MEMORY_WORTH_*); convert duplicated rule copies to pointers into `prompt-system/`.
6. Add a memory-worth row to the 00-system MCP matrix (phase pairing: REVIEW close + session close; no-go: never send secret material).
7. Extraction (moves 07-protocols content into load-on-demand files with trigger entries in `11-triggers.md`): API architecture section (~253 lines), Library selection, App lifecycle. Fix the dangling `## Database` reference at `07:494`.
8. Validation: regenerated adapter diff review; fresh-session smoke (STARTUP completes; PATCH phase pulls the review tier); token measurement <= ~31k words resident.

## Phase 3 -- Single-source the canon

1. Decision format (`02-decision-prompts.md` sole owner): canonical literal `**A. option text**` (what S20 already checks; minimal edit surface); rewrite 02's Rendering Rule + its own example; update `03:354/374/448`, `01:40`, `04b`; delete the `## Open question for you` allowance from `00:390` (DISCUSS is the channel for open questions); legalize the REVIEW confirmation block + reply vocabulary as a formal extension in 02; scope "only Decision blocks" wording to question formats and position.
2. Phase graph: add missing edges to the 00 legality table (`SPRINT -> TASK_PLAN`, `BACKLOG -> TASK_PLAN`, `HANDOFF -> PATCH`, `HANDOFF -> CHECKLIST` if used); resolve SPEC ownership (00:221 label: Sensei owns the default spec route, ScrumMaster owns spec inside the scrum pipeline) and add/justify the `STARTUP -> SPEC` edge or remove the dead route; scope T-07 (`11-triggers.md:66`) to `/bootstrap` or goal-mode without a concrete target.
3. Rewrite contract: one definition (canonical in `06-misc.md`), `00:150`/`00:402-408` become pointers; drop or alias the orphaned `must-add` field to the approved `Will change` records.
4. Commit/push gate: rewrite `06-misc.md` `## Commit/push gate (full rules)` as one numbered pipeline (trigger -> smoke-if-UI -> lock check -> stage -> plan-actual -> delegation -> ask) with cost-proportional skip valves (trivial diff, docs-only, non-UI); `08-plan-actual-gate.md` + T-15 + 03 reference it instead of restating; fix `expect: silent` -> `expect: fail` (`06:102,114`); 08: absence = exit 1 exactly (exit >= 2 = FAIL), define `contains:<literal>`, mandate re-stage before gate re-run, define the retry diff snapshot, route missing-verify to a plan amendment; align auto-close triggers (06 vs 07 vs T-18) and the SKIPPED category list (`00:620-626`: add `plan-actual`, `review-delegation`, `playwright-smoke`).
5. Dedup sweep (bounded to audit-named pairs; one home each, pointers elsewhere): identity rules (AGENTS.md <-> 00), commit/push (7 files -> 1 + pointers), blank-line list rule, `rules.md` advisory wording, S14-S17 bodies (05 vs 04 vs rules.md -- 05 cites IDs only).
6. Validation: remove Phase 1 baseline allowlist entries covering these items; suites strict and green.

## Phase 4 -- Enforcement and content fixes

1. Load rules where they fire: reclassify `rules.md` (and the Discovery-relevant parts of 07) so CHECKLIST/REVIEW have detection + auto-exceptions available (new load group in 00; T-09/07 Discovery points at `rules.md`, not 04).
2. `rules.md`: add H20d detection; fix self-contradictory advisory lines; delete the H30 `recursive:`-style and H36 `as unknown as` exemptions; add an H30 auto-exception for the .NET `TryXxx` idiom; remove the dead H26 exception; retarget the stale stacks pointer (`rules.md:800`).
3. Emit per-rule audit rows: 03 PATCH self-review/constraint-verification templates generate rows from Discovery `rule_triggers` (covers the ~21 rules that currently fire nowhere).
4. Stacks (all 8): add a 2-3 line scope header ("greenfield defaults; existing projects: preserve-local wins; system rubrics outrank stack idioms"); then targeted fixes: TS try/catch precedence + legacy-idiom carve-out, Node floor 22/24; Python `result`-package naming + Pylance/Pyrefly clarification + 3.13 note; Java drop `maven.lock`, add Spring block or mark thin-by-intent; C# drop `out` mandate (fold into TryXxx exception), add async/nullability lines; frontend replace `got` with fetch/axios client-side (scope `got` to Node), drop forced `lang="ts"`; database merge the two drafts, tag engine-specific lines; pinescript dedupe continuation rules + version bullet; PowerShell approved-verb wording + self-defeating example fix.
5. `09-design-guidelines.md`: delete STYLE_POLICY.md write instructions (palettes recorded in DESIGN_PLAN fields only); add a compact SEO section (or retarget `STACK-frontend.md:13`); soften the hero rule to default-with-exception.
6. `10-doc-style.md`: correct the TOC gate to `pre-commit.ps1` reality (or actually wire markdown-toc); add portable-vs-source-repo scope banner; complete the lint table (MD038, SESSION_STATE ignores); fix step numbering.
7. `11-triggers.md`: T-18 anchor fix; T-24 single canonical detection spec (owned keyword list, cited by 04 + load order); T-03 batch-estimate definition or drop; T-04 verbatim list or pure pointer; add a trigger-precedence line to the catalog header; shrink T-01..T-04 summaries to pointers.
8. `07-protocols.md`: delete (no owner exists) the quarantine-cascade subsection at `:442`; legalize `rule_exceptions` as an optional user-authored frontmatter block in T-01/STYLE_POLICY (bot reads, never writes); fix `:306` to describe the actual re-stage behavior and delete the dead diff helpers in `pre-commit.ps1:87-116`; dedupe close-session (06 canonical); register or fold orphan protocols (library selection -> PLAN, app lifecycle -> PATCH verification).
9. Fix H14/H15 annotation errors in `03:584,590` and `07:238,241`.

## Phase 5 -- Script fixes

1. `session-locks.ps1`: idempotent self-owned re-entry in `Enter-DependencyLock` (refresh, preserve `dependencies.txt`); require or persist SESSION_ID for Enter/Exit (structured error when unset); translate only destination-exists IOException to contention -- structured failure otherwise (no raw throws); honor `BABA_READ_ONLY` in query functions; sweep stale `*.tmp` staging dirs; stop mutating caller's `$ErrorActionPreference`.
2. `test-session-locks.ps1`: add re-entry, two-process contender, reclaim-race, and `Get-LockStatus` cases; dot-source `test-assertions.ps1` instead of duplicating it.
3. Reference tooling: gate all writes behind a real `-DryRun` (`add-reference.ps1`, `refresh-reference-pool.ps1`); `manifest-io.ps1` byte-preserving writes (comments/blank lines) + explicit error on unrepresentable structures; fetch pinned content from `raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>` so `-Commit` pins; reject `..` path segments and assert final path under POOL_ROOT; `[CmdletBinding()]` + reject stray `$args`; fix `-DryRun` vs `--dry-run` in `.kilo/command/code-ref.md`; `build-arxiv-pdf.ps1` opt-in `-Install` + latexmk/2-pass; `init-reference-pool.ps1` repair path; UTF-8 no-BOM everywhere.
4. `pre-commit.ps1`: remove dead helpers; fix internal step-number comments.
5. Validation: run every suite; exercise dry-run vs live on a scratch pool under the OS temp dir; no repo mutations outside the edited set.

## Phase 6 -- Persona registry contract

1. `generate-adapters.ps1`: generate per-persona command/agent files from `personas.json` (already partially true); correct the "one entry = everything updates" claim to describe actual scope.
2. BabaCEO: integrate (non-destructive default) -- add `### BabaCEO` section to `01-personas.md`, bootstrap-table row, T-21 row, CEO->ScrumMaster handoff row, and `design_plan` / weak-hints slots in the template field matrix. Alternative if preferred: remove the baba-ceo adapter, command, and registry entry.
3. `personas.json`: keep consumed fields (name, colors, entryPhase, keywords); delete verified-dead fields (`opencode.*`, `kilo.temperature`, unused synonyms) after confirming the generator ignores them.
4. `01-personas.md`: fix the "Eight personas" count and the `.kilo/skills/spec` anchor; add tester/quant weak-hint slots to the handoff template (never-silently-drop rule needs a landing place).
5. Validation: adapter regen diff; `test-registry-drift.ps1` green; `/baba ceo` command resolves.

## Phase 7 -- Behavioral eval harness (recommended follow-up, separate session)

Golden-scenario runner (`prompt-system/scripts/test-golden-scenarios.ps1` + fixture scenarios): one scenario per phase transition and per trigger, asserting phase headers, decision-block format, gate rows, and BLOCKED shapes. Run pre-push. Deferred because it is a build, not a fix; Phases 1-6 are preconditions.

## Explicit decisions (recommended; amendable at review)

- Decision rendering literal: `**A. option text**` (S20-compatible; fewest edits).
- Open questions: banned mid-phase (00 clause deleted); DISCUSS is the escape channel.
- BabaCEO: integrate, not cut.
- `rule_exceptions`: user-authored STYLE_POLICY frontmatter extension; bot reads only.
- Arxiv/reference subsystem: fix safety in place (Phase 5); severing it into its own project stays a separate product decision.
- Hook chain: `pre-commit.ps1` is canonical; `.pre-commit-config.yaml` gets a deprecation comment or parity list.

## Out of scope

- Root docs rewrite (README/QUICKSTART/SYSTEM_OVERVIEW/CONFORMANCE) beyond fixes that require them.
- Deep audit of `.kilo/`, `adapters/`, and host plugins beyond Phase 2's loader alignment.
- Model routing / multi-model orchestration changes.
- Any change to persona voice or the phase-machine concept itself.

## Validation plan (whole program)

- Per phase: integrity suites + markdownlint green; diff inspected; per-edit lint gate honored.
- Phase 2 exit: fresh-session STARTUP smoke + one trivial DIRECT task end-to-end; resident-token measurement reported.
- Final: run all suites strict (zero baseline allowlist entries remaining); leftover audit; commit/push gate per repo rules with per-phase commits.

## Risks

- Unpinning 06/07/08 could starve non-PATCH phases of gate rules -- mitigated by the loader enforcing per-phase JIT loads (verify first) and by the Phase 2 smoke.
- Strict suites will surface additional latent drift -- handled by explicit baseline allowlist decay, never by weakening a check.
- Adapter regeneration can clobber hand-edits -- always fix the source, regen, and diff-review.
- S20/rendering sweep touches many files -- enforced by `test-decision-format.ps1`, not by memory.
- Session-locks changes affect the commit gate -- test suite updated in the same phase before behavior changes.

## Open questions

None blocking. All material decisions carry a recorded recommendation above and can be amended before implementation starts.
