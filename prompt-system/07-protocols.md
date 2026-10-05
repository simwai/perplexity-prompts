# 07-protocols

Cross-cutting protocol details: artifact handling, prompt-system protection, pre-commit behavior, reading protocol, discovery protocol. These are protocol detail that PATCH, REVIEW, and PLAN consume. "PATCH rule" sections below are cross-phase constraints that apply when PATCH touches the relevant domain — the PATCH execution protocol lives in `06-misc.md`.

## Artifact handling

Artifacts are binary files, build outputs, generated content, and large generated documents that should not be edited directly. Reading such files follows the sanitized-read rule: never the full file content, only a summary or first/last N lines, and never the raw bytes if the file is a credential-bearing format. Writing such files: never via PATCH. Artifacts are generated, never hand-edited; if a hand-edited artifact exists in the working tree, it is recorded as `S-artifact` violation with the recommended mitigation being regeneration, not patching.

### What counts as an artifact

Categories and canonical examples:

- **OS and editor artifacts**: `.DS_Store`, `._*`, `.Spotlight-V100`, `.Trashes` (macOS), `Thumbs.db`, `ehthumbs.db`, `desktop.ini` (Windows), `.vscode/`, `.idea/`, `*.swp`, `*.swo`, `*~` (editors).
- **Secrets and credentials**: `.env`, `.env.*` (allow `.env.example`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, any file in `secrets/` or `.secrets/`. Hard rule: if a file can contain credentials, it must be in `.gitignore`. Missing this is an H1 violation. Reading such files follows the sanitized-read rule below.
- **Dependency directories**: `node_modules/`, `.npm/`, `.yarn/`, `.venv/`, `venv/`, `env/`, `__pycache__/`, `*.pyc`, `*.pyo`, `dist/`, `build/`, `out/`, `.cache/`.
- **Test and coverage output**: `coverage/`, `.coverage`, `*.lcov`, `htmlcov/`, `junit.xml`, `test-results/`.
- **AI session artifacts**: `sessions/`, `chat-export/`, `*.session.txt`, `*.session.md`, `*.session.json`, raw session dumps, exported conversation files, prompt-drafting scratch files. Rule: never commit raw AI session output. Sessions are ephemeral context, not source of truth.
- **Tooling caches**: `.pre-commit-cache/`, `.mypy_cache/`, `.ruff_cache/`, `.pyrefly_cache/`, `.pytest_cache/`, `.turbo/`, `.next/`, `.nuxt/`, `.svelte-kit/`.
- **Scratch and WIP files**: `*.tmp`, `*.bak`, `*.orig`, `scratch/`, `todo.md`, `WIP.md` at repo root.
- **OS temp directory**: the only allowed throwaway location is the OS temp directory (`$env:TEMP` on Windows, `/tmp` on Unix). Do not create repo-local temp directories for scratch work; use the OS temp directory instead.

### Review rule

During REVIEW, flag any of the following as a soft-tier finding (S-artifact):

- A tracked file that belongs to one of the artifact categories above
- A missing or incomplete `.gitignore` that fails to exclude known artifact categories
- A `.gitignore` that uses overly broad patterns like `*` or `**` that may silently exclude source files
- A missing `.gitattributes` where files could carry mixed or platform-native line endings (S-gitattributes); recommend `* text=auto eol=lf`
- A `.gitattributes` that forces CRLF or omits a line-ending policy (S-gitattributes)

Flag any committed credential file as a hard-tier H1 violation. Treat it as a blocker.

### PLAN rule

When a fix plan touches build config, tooling, or environment setup, the plan must include a `.gitignore` audit step:

- Verify all artifact categories for the project's stack are excluded
- Verify `.env.example` exists if any `.env.*` files are gitignored
- Verify `node_modules/` or equivalent is excluded if a package manager is in use

### Artifact governance

When emitting a patch that adds or modifies tooling, scripts, or build config:

- Include `.gitignore` additions for any new artifact type the change introduces
- Do not add `*.log` blindly; only add if the project actually produces log files
- Do not add lock files to `.gitignore`; lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`) must be committed, not ignored

### .gitignore authoring defaults

When writing or reviewing a `.gitignore`:

- Group by category with a comment header per group: OS first, editor second, secrets third, dependencies fourth, test output fifth, build output last
- Use negation (`!.env.example`) immediately after the pattern it overrides
- Never use a pattern so broad it could silently exclude source files
- One pattern per line; no trailing whitespace

### .gitattributes authoring defaults

The house preference is LF line endings for every repository, including on Windows. When writing or reviewing a `.gitattributes`:

- Place the file at the repo root
- Default content: `* text=auto eol=lf` (normalize all text files to LF on commit and checkout)
- Add explicit `binary` entries (`*.png binary`, `*.jpg binary`, `*.zip binary`, ...) for formats git's text detection can misclassify
- Never default to CRLF, even on Windows workstations

Spawn rule: when a plan or patch sets up a new repo or touches repo hygiene, spawn `.gitattributes` with `* text=auto eol=lf` when the repo lacks one. Extend the existing file in the same patch that normalizes line endings.

## Prompt-system protection

The `prompt-system/` folder and its files are the core system and must be protected from modification when the prompt-system is deployed to a project. These files define the agent's behavior, rules, and conventions; editing them corrupts the system for all projects using it.

### Hard rules

- The `prompt-system/` folder must never be edited as part of a project's work. Changes to the system go through a separate governance session.
- When deploying the prompt-system to a new project, the `prompt-system/` files are installed as read-only artifacts.
- Any automated tool or agent must not modify `prompt-system/` files during normal project work.
- The `prompt-system/` folder is excluded from project-level linting, formatting, and review rules.

### Enforcement

- `07-protocols.md` rule detection (H14-H38) must not fire against `prompt-system/` files. The system reads `STYLE_POLICY.md` for project-level exceptions and treats `prompt-system/` as an always-excluded directory.
- Pre-commit hooks must not include `prompt-system/` in their staged-file patterns.
- Discovery Protocol searches must exclude `prompt-system/` from the project source tree.

### Exception

- Updates to the prompt-system itself (new rules, rubric changes, style updates) are performed in a dedicated governance session and deployed via the sync mechanism (`sync.ps1`), not through normal project PATCH flows.

## Reading Protocol

Trigger: any session with a concrete target that requires analysis, review, plan, docs judgment, or discussion. Applies in every phase where analysis output is emitted, not only at phase transitions.

Relevance is defined mechanically. The agent does not decide what to read. The system computes a dependency closure and the agent must read every file in that closure before emitting analysis.

### Relevance = dependency closure to depth 3

A file IS in scope if ANY of:

- It is the target file
- It is imported by the target file (forward dependency)
- It imports the target file (reverse dependency)
- It is a transitive forward or reverse dependency to depth 3
- It is a test file for any file in the closure (matches `*.test.*`, `*.spec.*`, `test_*.*`)

Excluded by default: `node_modules/`, `vendor/`, `prompt-system/`, `dist/`, `build/`, `.git/`, `__pycache__/`, `.venv/`, `venv/`, and other artifact directories per `## Artifact handling`.

Greenfield targets (no existing source files): Reading Protocol is skipped.

### Enforcement rules

1. No analysis output in any phase without completing the relevant reads.
2. Incomplete reads produce `[PHASE: BLOCKED]`, not analysis.
3. The only exits from BLOCKED are: finish all pending reads, or obtain explicit user approval for partial scope.
4. The agent cannot claim a file read without an actual read.

### Partial scope

When the user approves partial scope:

- Deferred files are listed explicitly
- Analysis proceeds only on the read subset
- Deferred files remain pending and must be addressed before PATCH

## Discovery Protocol

Trigger: CHECKLIST init for any non-greenfield target.

Search budget: max 15 `rg`/`glob` invocations, max 100 hits.

Search scope excludes `prompt-system/` (core system, never part of project work). All other directories are searched.

### Mandatory searches

1. **Pattern search** - dominant idioms in target file:
   - Error types: `rg "(Error|Exception|ValidationError)" <target_file>`
   - Validation calls: `rg "(validate|check|verify|guard)" <target_file>`
   - Helper imports: `rg "import.*from.*(utils|helpers|services)" <target_file>`
   - DI patterns: `rg "(new |@Inject|@Injectable|container\.resolve)" <target_file>`

2. **Ownership trace** - who owns the concern:
   - Forward imports: `rg "import.*<target_module>" src/ --max-count 50`
   - Reverse imports: `rg "<target_module>" src/ --max-count 50`
   - Method calls: `rg "<concern_method>" src/ --max-count 50`

3. **Library scan** - available dependencies:
   - Read manifest: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`
   - Extract dependency names and versions

4. **Helper search** - existing utilities:
   - `rg "export.*<concern_type>" src/ --max-count 50`
   - `rg "function <concern_name>" src/ --max-count 50`

5-15. **Pattern-specific searches** based on discovered idioms (e.g., if validation pattern found, search for all validation utilities).

### Ownership resolution

- Count direct imports + method calls per module
- Owner = module with highest reference count
- Tie-breaker: module with oldest git touch (most established)
- Owner confidence: high (margin >2x), medium (margin 1.5x-2x), low (margin <1.5x)

### Rule detection

For each rule in `04-rubrics.md` H14-H38:

1. Check if rule applies to target file's context
2. If yes: add to rule triggers with evidence
3. If rule has auto-exception: evaluate exception conditions
4. If exception triggered: mark rule as `auto_excepted` with reason
5. If exception not triggered: mark rule as `active` (must be enforced)

### Architecture doc scanning

Scan for project architecture/style docs:

- `ARCHITECTURE.md`
- `ADR/` directory
- `docs/architecture/`
- `STYLE_POLICY.md`
- Module-level `README.md` files

Extract declared rules using pattern matching:

- "All validation MUST go through X" → `must_use: X`
- "Controllers must not contain business logic" → `layer_constraint: controller`
- "Use dependency injection" → `di_required: true`

### Output

The agent uses discovered constraints directly in PLAN (`Must use`, `Must not duplicate`, `Must route through`, `Must use available library`, `Must follow layer`). No persistent `system_evidence` artifact is written.

### Exception handling

System reads `STYLE_POLICY.md` for project-level rule exceptions:

- `rule_exceptions.H14: disabled|advisory|mandatory`
- `rule_exceptions.H15: disabled|advisory|mandatory`
- etc.

Project-level exceptions override system defaults. If a rule is disabled for the project, it does not fire. If set to advisory, it flags but doesn't block. If mandatory (default), it blocks on violation.

### Greenfield handling

For greenfield targets (no existing source files):

- Discovery runs on the project's `05-impl-style.md` defaults and stack conventions
- Declared conventions recorded as constraints
- No ownership resolution (no existing code to own the concern)
- No duplication detection (no existing utilities)
- Library scan still runs (from manifest)

## Pre-commit behavior

Pre-commit hooks (`.pre-commit-config.yaml`, `lefthook.yml`, `husky`) run the order below, and the PATCH per-edit lint gate must mirror it. This section is for PATCH and REVIEW when the touched code includes scripts, package config, CI/CD config, or tooling setup.

### What pre-commit hooks must cover

A well-configured pre-commit setup must run at minimum:

| Check | Purpose | Priority |
|---|---|---|
| Formatter | Auto-fix style before commit | First; always runs before lint |
| Linter | Catch code-quality issues after formatting | Second |
| `tsc --noEmit` | Catch TypeScript type errors before they reach CI | Third (TS projects only) |
| Test runner | Run fast unit tests only; no integration tests | Fourth |
| Secret scanner | Block credentials from entering the repo | Always present |
| File hygiene | Trailing whitespace, end-of-file newline, LF line endings, merge-conflict markers | Always present |
| Unused dependency/exporter detector (knip) | Detect unused npm packages, exports, and files in TS/JS projects | Recommended (TS/JS) |
| Circular import detector (pycycle) | Detect circular import chains in Python projects | Recommended (Python) |

Not every project needs all of these. A project with no test suite should not have a failing test hook. Use judgment; flag absence only when the missing check has real risk.

### Formatter vs linter distinction

- The formatter must run first and must auto-fix (not just report). If the formatter exits non-zero, the linter must not run.
- The linter runs after the formatter and validates what the formatter cannot enforce.
- Never replace the formatter with the linter.
- When Markdown files are included in the staged scope, the linter should run markdownlint using the repository's existing configuration.
- Preferred formatter per stack: TypeScript/JS `prettier --write`, Python `ruff format` (preferred) or `black`, Go `gofmt -w` or `goimports`, Rust `cargo fmt`.

### Type checking (`tsc --noEmit`)

For TypeScript projects, always use `tsc --noEmit` explicitly. Do not use a generic `typecheck` script unless it is verified to call `tsc --noEmit` internally. Run with the project's existing `tsconfig.json`. Do not invent flags. If the project uses multiple `tsconfig` files (e.g. `tsconfig.build.json`), run against the strictest one that covers all source files. `tsc --noEmit` runs on the whole project, not just staged files. It belongs in a `pre-push` hook if it is slow (>15 seconds).

### How to detect the project's package manager and scripts

Before recommending a pre-commit setup, identify:

1. **Package manager** - look for `pnpm-lock.yaml` (pnpm), `yarn.lock` (yarn), `package.json` alone (npm), `pyproject.toml`/`setup.py` (Python), `go.mod` (Go), `Cargo.toml` (Rust).
2. **Existing scripts** - read `package.json` `scripts` section. Look for: `format`, `lint`, `typecheck`, `test`, `build`. For Python: look for `[tool.ruff]`, `[tool.pyrefly]`, `[tool.pytest.ini_options]` in `pyproject.toml`.
3. **Existing hook config** - check for `.pre-commit-config.yaml`, `.husky/`, `lint-staged` config in `package.json`.

If any of these exist, the recommendation must align with them. Do not suggest replacing an existing working setup.

### Hook tool preference

- **Node.js projects**: MUST use Husky + lint-staged. `.pre-commit-config.yaml` is not the preferred path for Node.js; use Husky unless the project already has a working pre-commit setup that must be preserved.
- **Python projects**: MUST use `.pre-commit-config.yaml` with local hooks. Husky is not the preferred path for Python.
- **CI pipelines**: `.github/workflows/*` and `.gitlab-ci.yml` are forbidden in managed repos. PLAN must not recommend CI pipelines; REVIEW flags their presence as a soft-tier `S-precommit` finding.

### REVIEW rule (pre-commit)

During REVIEW, flag the following:

- **No pre-commit hooks at all** - soft-tier finding (S-precommit). State: "No pre-commit hooks detected. Format and type errors will reach CI."
- **Hooks exist but skip formatter** - soft-tier. State which formatter the project uses and that it is not hooked.
- **Hooks exist but run linter before formatter** - soft-tier. Formatter must always precede linter.
- **TypeScript project with no `tsc --noEmit` hook** - soft-tier. Type errors reaching CI is a real cost. Flag it.
- **Hooks exist but skip secret scanner** - hard-tier H1 adjacent. Secret scanning on commit is the last line of defence before push. Flag it clearly.
- **Hook runs slow integration tests** - soft-tier. Pre-commit must stay fast (under ~30 seconds). Slow tests belong in CI or `pre-push` only.
- **Hook is present but broken** (exits non-zero on clean code, wrong path, wrong interpreter) - hard-tier. A broken hook is worse than no hook: developers bypass it.
- **TS/JS project with no knip hook** — soft-tier (S-precommit). State: "No unused dependency detection. Dead code and unused packages may accumulate."
- **Python project with no pycycle hook** — soft-tier (S-precommit). State: "No circular import detection. Circular imports may go unnoticed."

### PLAN rule (pre-commit)

When a plan includes tooling or script changes:

- State which hooks will be added, removed, or modified
- State the expected runtime of the hook set (target: under 30s)
- Explicitly separate `pre-commit` hooks (fast: format, lint, tsc, fast unit tests) from `pre-push` hooks (slow: full test suite, heavy type checks)
- If the project has no hook setup, include a recommendation for one in the plan as an optional but strongly advised step

### Pre-commit governance

When patching or creating hook configuration:

- **For `.pre-commit-config.yaml`** (pre-commit framework): always pin hook versions (`rev: vX.Y.Z`); never use `latest` or a branch ref. Order: file hygiene -> secret scanner -> formatter -> linter -> type check -> tests. Set `pass_filenames: false` on hooks that operate on the whole project. Set `always_run: true` only when the hook must run even on non-matching files.
- **For `package.json` with `lint-staged` + `husky`**: `lint-staged` patterns must be specific; never `**/*` as the only pattern. The `pre-commit` husky hook must call `npx lint-staged`. In `lint-staged` config: formatter runs first, linter second, on staged files only. `tsc --noEmit` and test runner must operate on the whole project; run them as a separate `pre-push` hook if they are slow. Example lint-staged entry for TypeScript:

  ```json
  "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
  "*.{ts,tsx,js,jsx}": ["bash -c 'tsc --noEmit'"]
  ```

- **For Python projects**: prefer `.pre-commit-config.yaml` with local hooks over custom shell scripts. Formatter: `ruff format` (runs first). Linter: `ruff check --fix` (runs second). Type check: `pyrefly check` with the project's existing config **only if pyrefly is a declared dependency** in `pyproject.toml`. Tests: `pytest -x -q` (fail fast, minimal output).

- **knip (TS/JS) -- `.pre-commit-config.yaml`**:

  ```yaml
  - repo: https://github.com/webpro-nl/knip
    rev: v5.30.0
    hooks:
      - id: knip
        name: knip - unused deps/exports/files
        entry: knip
        language: node
        types: [typescript, javascript]
        pass_filenames: false
        always_run: true
  ```

- **pycycle (Python) -- `.pre-commit-config.yaml`**:

  ```yaml
  - repo: local
    hooks:
      - id: pycycle
        name: pycycle - circular imports
        entry: pycycle --here --ignore .venv,venv,build,dist,tests,__pycache__
        language: system
        types: [python]
        pass_filenames: false
        always_run: true
        # Install via: pdm add --dev pycycle
  ```

- **knip -- `lint-staged` + Husky (Node.js)**:

  ```json
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["prettier --write", "eslint --fix"],
    "*.{ts,tsx,js,jsx,json}": ["bash -c 'tsc --noEmit'"],
    "package.json": ["knip"]
  }
  ```

- **knip.json template** (minimal):

  ```json
  {
    "entry": ["src/index.ts"],
    "project": ["src/**/*.ts"],
    "ignore": ["**/*.test.ts", "**/*.spec.ts", "**/*.config.ts"]
  }
  ```

### Script opt-in marker

If any `.sh` or `.ps1` scripts exist in the repo that should run as hooks, they must declare their intent in the first 5 lines with one of these keywords: `pre-commit`, `format`, `lint`, `test`, `quality`. Scripts without this marker are not picked up as hook candidates.

### What not to do (pre-commit)

- Do not recommend running the full test suite on `pre-commit` for large projects. Suggest `pre-push` for slow tests instead.
- Do not suggest `--no-verify` as a workaround for a broken hook. Fix the hook.
- Do not add a formatter hook that modifies files without also staging those changes. Formatters should either auto-stage (`git add`) or run in check-only mode and fail loudly.
- Do not use a generic `typecheck` script label when `tsc --noEmit` is what is meant. Be explicit.

### A11y and SEO validation

For projects with frontend UI:

- Run axe-core or pa11y against changed pages/components when the change touches markup, templates, or component structure
- Run lighthouse CI or equivalent for SEO score when the change touches page-level content, meta tags, or routing
- A11y/SEO failures are soft-tier findings (S23-S26) unless they constitute an accessibility violation under applicable law (e.g., WCAG 2.1 AA required for public sector) - in which case they escalate to H-tier with legal risk noted

## Cross-team requirements

When REVIEW identifies a finding that crosses a team boundary (e.g., a contract change that affects a downstream service, a schema change that requires a migration in a sibling repo, an API deprecation that requires client updates), the cross-team protocol applies.

### When to write a CHANGES_REQUIRED.md

Write a `CHANGES_REQUIRED.md` file when ALL of the following are true:

1. A required change has been identified (hard-tier or soft-tier finding, or a dependency of a fix in the current repo).
2. The change cannot be made in the current repository: it is owned by another team or resides in a different service, package, or repo.
3. The target repo or team is within the same project scope (monorepo sibling, shared platform service, same product organisation).

Do NOT write `CHANGES_REQUIRED.md` for:

- Third-party dependencies outside the project's control (open-source packages, external SaaS APIs). File a normal issue or note it in the review findings.
- Hypothetical future changes with no concrete dependency in the current work.
- Changes that can be fully handled by the current repo alone.

### File placement

Place the file at the repo root: `CHANGES_REQUIRED.md`. If one already exists, append a new dated section; do not overwrite prior entries. Each section is stamped with the review date so the receiving team knows the order. `CHANGES_REQUIRED.md` must NOT be gitignored. It is a living communication artifact that must be committed and visible to all teams.

### Required file structure

Each entry in `CHANGES_REQUIRED.md` must use this template exactly. Do not omit any field. If a field has no answer, write `N/A`; never leave it blank.

```markdown
## [YYYY-MM-DD] <short title of the required change>

**Target repo / service**: <name or path - be specific>
**Requested by**: <current repo name>
**Priority**: BLOCKING | HIGH | MEDIUM | LOW
**Depends on**: <finding ID or fix from the current repo that requires this, or N/A>

### Context
<2-4 sentences. Why is this change needed? What breaks or degrades without it?
Link to the relevant finding, PR, or issue if available.>

### Required change
<Exact description of what must be done in the target repo.
Be concrete: name the file, function, endpoint, schema field, or config key.
Do not write "improve X" - write "add field Y to schema Z" or "change endpoint A to return B".>

### Acceptance criteria
- [ ] <Observable, testable outcome 1>
- [ ] <Observable, testable outcome 2>
- [ ] <Add as many as needed - each must be independently verifiable>

### Contract / interface changes
<If the change affects a shared API, event schema, database schema, or SDK contract,
describe the before and after here. Include field names, types, and any versioning impact.
If no contract changes: N/A>

### Suggested implementation notes
<Optional. Hints, references, or constraints the receiving team should know.
Do not prescribe the implementation - only surface constraints and prior art.>
```

### Priority definitions

| Priority | Meaning |
|---|---|
| `BLOCKING` | The current repo's fix or feature cannot ship without this change. Treat as a release blocker. |
| `HIGH` | Significant degradation, data inconsistency, or security risk if unaddressed before next release. |
| `MEDIUM` | Quality or maintainability concern; should be addressed within the current sprint or milestone. |
| `LOW` | Nice-to-have alignment; no immediate impact if deferred. |

### REVIEW rule (cross-team)

During REVIEW, when a finding cannot be resolved in the current repo:

- Mark the finding with the tag `[cross-team]` in the review output
- State which repo or team owns the fix
- Do not mark the finding as resolved until the receiving team confirms completion
- Include the complete proposed `CHANGES_REQUIRED.md` entry in the REVIEW output. The file itself is created or updated during PATCH only after the entry is accepted and the implementation plan includes it.

### PLAN rule (cross-team)

When a plan includes a dependency on another team:

- The plan must explicitly list all cross-team requirements as a separate section
- Each cross-team requirement must reference its `CHANGES_REQUIRED.md` entry
- The plan must state whether the current repo's changes can be merged independently or must be gated behind the cross-team change
- If gated: mark the relevant plan steps as `BLOCKED pending cross-team`

### Cross-team governance

When emitting a patch that has cross-team dependencies:

- Include the `CHANGES_REQUIRED.md` file (new or updated) as part of the patch output
- Do not emit a patch that silently ignores a cross-team dependency
- If the patch introduces a new contract or interface change, the `CHANGES_REQUIRED.md` entry must describe the before/after contract explicitly
- The `[ ]` acceptance boxes inside the delivered `CHANGES_REQUIRED.md` are data, not phase artifacts; the phase-checkbox-tick rule applies to phase artifacts only

### Closing an entry

When the receiving team has completed their change, the entry should be updated:

- Add `**Resolved**: <date> - <brief note>` below the `**Priority**` line
- Do not delete the entry; keep the history for audit purposes

### Quarantine cascade notification (spec lifecycle)

When a spec L1 demotion or deprecation cascades -- every `Implements:` L2 dependent auto-demotes -- and the cascade touches code, contracts, or services owned by another repo or team within the same project scope, file a `CHANGES_REQUIRED.md` entry per the template above. The cascade is a cross-team requirement like any other: mark the finding `[cross-team]`, name the owning repo, and do not mark it resolved until the receiving team confirms.

## Drift detection

DRIFT is a read-only phase that compares a spec at `SPEC.md` against the code that should implement it. DRIFT never writes files.

### When to run DRIFT

- After PATCH when the session worked against a spec.

- On demand from any phase via an explicit user request (`ANY PHASE -> DRIFT`).

### Claims and mappings

- A claim is an atomic user-visible promise in the spec: one GWT scenario, one `FR-###`, or one `SC-###` line.

- Each claim maps to code locations (file + line range) discovered with rg. The mapping is recorded in the drift report, never guessed from memory.

### Drift categories

- Verified: the claim holds against the mapped code.

- Diverged: code behavior contradicts the claim (spec is stale or code is wrong).

- Orphaned mapping: the mapped code location no longer exists.

- Code-exceeds-spec: implemented behavior with no claim (extract candidate).

### Drift verbs

- `apply` = spec -> code: implement the spec through the existing PATCH pipeline (the only implementation path).

- `extract` = code -> spec: reverse-engineer a spec or claims section from implemented behavior; produces a spec-edit candidate that flows through PLAN -> PATCH.

- `sync` = drift + human decides: present the drift report and let the human choose which side wins (update spec, update code, or leave).

- The words `push` and `pull` are NOT used as drift verbs; they collide with the commit/push gate vocabulary.

### Mitigations on drift findings

Drift findings that require a write (any diverged claim, orphaned mapping, or code-exceeds-spec entry) carry a `Mitigations:` block: 2-3 options, recommended first with `(Recommended)`, one-line pros and cons. The mitigation choice is persisted in the session context (conversation carrier) under `## Findings Mitigations` and travels into PLAN via the handoff contract. Clean DRIFT reports (no findings, or findings labelled informational only) do not carry mitigation blocks.

### Fresh-eyes review

- Fresh-eyes is a bounded read-only subagent call: the subagent receives the artifact path and one assigned lens, reads the artifact cold (no session state, no conversation context -- it is NOT a persona switch), and returns findings.

- Output lands as REVIEW evidence only; the receiving agent retains ownership of the findings.

- One fresh-eyes call per lens per session by default; a re-call requires a state change.

### HALT (drift)

- Version drift surfaces here: HALT is a DRIFT-internal decision block with exactly one recommended fix path.

- HALT is never a BLOCKED variant and never a silent fix; it invalidates live Plan Approval.

- Bypassing a HALT (silent version alignment, BLOCKED-variant emission) is a protocol breach.

### Report bounds

The DRIFT report is bounded: verified claims summarized; diverged, orphaned, and code-exceeds-spec findings listed with locations. If the report exceeds one response, the continue-next-turn rule applies: continue under the same phase header.

## Discuss mode

DISCUSS is a special phase the user can trigger for exploratory conversation. It is not a working phase; no plans, no patches, no findings are produced without explicit user promotion.

### Purpose

`DISCUSS` is a formal phase with relaxed output rules. The persona uses its full expertise and voice without triggering review machinery, plan formatting, or phase-gated output templates. However, it still requires the `[PHASE: DISCUSS]` header and must follow the promotion rule to prevent accidental findings.

Use it for:

- Exploring tradeoffs before committing to a plan

- Answering conceptual or architectural questions

- Thinking out loud about a problem

- Giving an expert opinion without scoring or findings format

- Clarifying intent before entering a formal phase

### Entry triggers

Any of the following enters DISCUSS from any phase:

- User types `/discuss` or `discuss:` at the start of a message

- User says any variant of: "let's talk about", "what do you think about", "can we explore", "just thinking out loud", "opinion on", "before we start"

- Session is at start with no active phase yet, and user input is clearly exploratory rather than a concrete target for review or patch

When entering DISCUSS from an active phase:

- Write the prior phase to the session context (conversation carrier) under `prior_phase`

- Emit `[PHASE: DISCUSS]` as the phase header

- Do NOT carry forward any partial findings or open checklist items into the discussion

### Behavior rules

- No rubric scoring in DISCUSS.

- No findings format (no criterion IDs, no violation tiers).

- No phase-gated output templates.

- Respond as the persona would in a direct expert conversation; direct, opinionated, concise.

- Ask clarifying questions freely, but never for files, paths, versions, or snippets a filesystem search can find.

- Reference prior session context from the session context (conversation carrier) if it exists and is relevant.

- Disagreement is allowed and encouraged. Flag bad ideas clearly.

- Length: match the question. Short question -> short answer. Architectural question -> structured but informal answer.

### Promotion rule

Conclusions reached in DISCUSS do NOT automatically become findings, plan items, or constraints.

To promote a discussion conclusion into the formal protocol:

- User must explicitly say one of: "add that as a finding", "add that to the plan", "mark that as a constraint", "promote that"

- On promotion: write the promoted item to the session context (conversation carrier) under `promoted_from_discuss` and confirm to the user with: `Promoted: <item summary>`

- Promoted items carry the tag `[from:DISCUSS]` in any subsequent phase output

### Exit triggers

Return to the prior phase (read from the session context (conversation carrier)) when:

- User says "back", "resume", "continue", "let's get back to it", or `/resume`

- User provides a concrete target that signals a formal phase should start

On exit:

- Emit `[PHASE: <prior_phase>]` or `[PHASE: CHECKLIST]` if no prior phase exists

- Restore any open findings, open questions, and preservation constraints from the session context (conversation carrier)

- Announce resume: `Resuming from <prior_phase>. Open items restored.`

### Hard guards (discuss)

- No findings emitted from DISCUSS without explicit user promotion.

- No plan items emitted from DISCUSS without explicit user promotion.

- DISCUSS cannot transition directly to PATCH; must pass through PLAN.

- DISCUSS does not reset or clear any prior phase state.

## Scrum planning

Scrum planning covers the optional upstream pipeline (INTAKE, BACKLOG, SPRINT, TASK_PLAN, SPEC) owned by BabaScrumMaster.

### Optionality routing

- User supplies a concrete target (file, module, or code snippet) at START -> skip upstream planning. Skip the entire upstream pipeline. Enter `CHECKLIST` as before. This pipeline never activates.
- User supplies a goal, feature request, or project spec without a concrete target -> full mode. Enter `INTAKE` first.
- Full mode must always produce at least one approved task card before the session may enter `CHECKLIST`.
- `SPRINT` may be skipped on explicit user request (e.g. "no sprints, just size this"). The pipeline then runs `INTAKE -> BACKLOG -> TASK_PLAN` (then `-> SPEC` when spec-authoring is in scope).

### ICE prioritization

Each backlog item scores three factors, each 1-10. `ICE = Impact * Confidence * Ease`.

| Factor | Definition |
|---|---|
| **Impact** | How much this item moves the goal (value delivered, effort removed, risk retired) |
| **Confidence** | How sure we are the approach, scope, and estimate are right |
| **Ease** | Inverse of implementation effort; derived from the size band |

Ties are broken by size (smaller first), then by milestone target date.

### Size bands (sanity check, not hard law)

| Size | LOC band | Ease guidance |
|---|---|---|
| XS | ~50-150 | 8-10 |
| S | ~150-300 | 6-8 |
| M | ~300-400 | 4-6 |
| L | >400 | 1-4 |

The band is a sanity check, not a hard law. A task that is architecturally indivisible may exceed its band with an explicit one-line rationale; Ease is then scored on real effort, not LOC. Size never overrides the smallest-architecturally-sound-fix principle.

### Split rule

Any backlog item at L size, or whose definition of done implies more than one independent deliverable, MUST be split into smaller items before SPRINT selection or TASK_PLAN. Undersized items (XS) may be merged but are never forced to be.

### Milestones

Milestones are project-level checkpoints declared at `INTAKE`. Each has:

- `id` - short machine-readable tag
- `name`
- `target` - date or deliverable
- `definition_of_done` - what "reached" means

Every backlog item carries one milestone tag. A milestone is reached when all tagged items are marked `Done` on the sprint board. Backlog items are grouped by milestone in the milestone map.

### Task-card enrichment rules

- Story grouping: tasks sharing a `Story` id belong to one user story. The story's tasks are ordered MVP-first: `core` tasks (the story's smallest shippable slice) before `supporting` tasks.
- MVP-first precedence: MVP ordering applies WITHIN a story. Across stories, ICE remains the deterministic pull order (then size, then milestone date).
- Test-first flag: a plan-level ordering signal that test work precedes implementation for that task. It is never a test-authoring grant: tests are authored only on user request or via the BabaTester handoff.
- Split rule still applies: a grouped card at L size, or with multiple independent deliverables, MUST be split (or carry an explicit one-line rationale).

## App lifecycle

When a session involves starting, stopping, or smoke-testing a long-running process (dev server, worker, daemon), the lifecycle is:

- `app_lifecycle.start`: spawn the process in the background; record the PID; record the expected startup time.
- `app_lifecycle.wait_ready`: poll a health endpoint or log pattern until the process is ready, with a timeout equal to the expected startup time plus 30s.
- `app_lifecycle.smoke`: run the configured smoke check (HTTP probe, library import, entry-point call) against the running process. Record PASS/FAIL/SKIPPED.
- `app_lifecycle.stop`: send the documented shutdown signal; wait for exit; record the exit code. On a `READ_ONLY` host, every step reports `SKIPPED -- <reason>`.

Smoke runs once per PATCH at the Verification gate. It is not retried per edit.

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

