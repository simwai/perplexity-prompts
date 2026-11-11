# Plan: markdownlint coverage for synced prompt-system content (all surfaces)

## Problem

Prompt-system content synced into target projects (`prompt-system/**`, `.opencode/{agents,commands}/**`, `.kilo/{agent,command,skills}/**`, `.claude/{agents,skills}/**`, `AGENTS.md`) gets flagged by markdownlint in targets on three surfaces:

1. **Commit gate**: shipped `pre-commit.ps1` step 7 lints every staged `.md` with an unconditional `--config "$repoRoot\.markdownlint.jsonc"` (`pre-commit.ps1:407`). In a target without that file (it is never shipped), markdownlint-cli prints "Cannot read or parse config file" and exits 4 → every commit with staged Markdown is blocked. With a stricter target config, the ~150 synced files (authored for this repo's tolerant config) fail → sync commits blocked.
2. **Manual runs**: `npx markdownlint-cli .` from a target root flags synced files unless a root `.markdownlintignore` excludes them.
3. **Editors**: the VS Code markdownlint extension removed `.markdownlintignore` support in 0.56 (DavidAnson/vscode-markdownlint#351); its current exclusion mechanism is a root `.markdownlint-cli2.jsonc` `ignores` array (also covers target CI running markdownlint-cli2).

Verified constraint: markdownlint-cli cannot express per-path config selection in one invocation (`-i/--ignore` is absolute-path minimatch, no per-path config override; `--ignore-path` presumes file existence — missing file = uncaught ENOENT, exit 1 — and matches patterns CWD-relative, markdownlint-cli#79/#80). Hence: partition in-script for the gate, ignore/config files for the non-gate surfaces.

## Decisions (resolved with user)

- **D1**: Hook gate = in-script partition of the staged `.md` set by sync-owned path prefix, up to two disjoint lint invocations with separate configs. No `.markdownlintignore`/`--ignore-path`/`Push-Location` consumed by the hook.
- **D2**: Ship a fallback config at `prompt-system\.markdownlint.jsonc` (travels via the existing robocopy `/MIR` of `prompt-system`, sync.ps1:115 + :213-221; never written to a target root).
- **D3**: sync.ps1 gains ensure-functions that merge sync-owned globs into each target's root `.markdownlintignore` (append-only) and `.markdownlint-cli2.jsonc` (**full merge — user's choice B**: parse, append missing `ignores` entries, rewrite, accepting comment loss).
- **D4**: The source repo gets no root `.markdownlintignore`/`.markdownlint-cli2.jsonc` — target-side only, preserving this repo's own manual lint coverage.

## Source of truth for sync-owned paths

`sync.ps1:114-119` (`$files`, `$folders`, `$copyOnlyFolders`) and the stage list at `sync.ps1:566`. Verified: `scripts/` contains no `.md` (`git ls-files scripts`); `user-guide/` is source-only (not in any sync list).

- Sync-owned directories (markdown-bearing): `prompt-system`, `.opencode`, `.kilo`, `.claude`
- Sync-owned root file: `AGENTS.md`

Maintenance obligation: when `sync.ps1` `$files`/`$folders` gains a Markdown-bearing path, update the glob lists and the hook's prefix list in the same change.

## Tasks

### 1. Fallback config copy (source repo)

Create `prompt-system/.markdownlint.jsonc`: content identical to root `.markdownlint.jsonc` plus a one-line header comment ("Fallback lint config for targets without a root .markdownlint.jsonc; keep in sync with the root file — consumed by pre-commit.ps1 step 7"). JSONC comments are established in this repo's config.

- Validate: `git diff --no-index .markdownlint.jsonc prompt-system/.markdownlint.jsonc` — identical modulo the header line.

### 2. Hook partition — `pre-commit.ps1` step 7 only (lines ~386-421)

Keep unchanged: staged-only gating, batch size 40, `$lintFailures` aggregation, hard `exit 1`, `--fix` hint message, `node`-availability guard, "No staged Markdown files" skip.

a. Add `$syncOwnedPrefixes` regexes (repo-root-relative, forward-slash normalized): `^AGENTS\.md$`, `^prompt-system/`, `^\.opencode/`, `^\.kilo/`, `^\.claude/` — with a comment citing `sync.ps1:114-119` as source of truth. (`.claude` is copied by sync but absent from the stage list at `:566` — include anyway; target owners may stage it manually.)

b. Partition `$stagedMd` into `$syncOwned` / `$targetOwned` before the batch loop (path normalization precedent: `Get-GeneratedFileMap`, `pre-commit.ps1:111`).

c. Config resolution per batch. `$targetOwned`: `--config "$repoRoot\.markdownlint.jsonc"` when it exists; else `Write-Warning "markdownlint config not found; using CLI defaults"` and lint without `--config` (new graceful degrade — verified absent today; a missing config currently exit-4s the hook). `$syncOwned`: config chain — root config when present → `prompt-system\.markdownlint.jsonc` when present → `Write-Warning` + skip the batch. Skip empty batches entirely (preserves the zero-cost property).

d. Idiom consistency: `Write-Warning` for degraded paths, `$LASTEXITCODE` checks (evidence: `pre-commit.ps1:393-394`, `:408`; `scripts/verify-system.ps1:133-134`).

### 3. Ignore-file merge — sync.ps1 `Ensure-MarkdownlintIgnoreEntries` (new, modeled on `Ensure-GitignoreEntries` at `sync.ps1:379-404`)

Append-only merge into the target's root `.markdownlintignore`, appending these managed lines (root-anchored, `**`-inside for directories):

```text
# --- baba prompt-system sync: machine-managed content, linted upstream (managed by sync.ps1) ---
/AGENTS.md
/prompt-system/**
/.opencode/**
/.kilo/**
/.claude/**
```

- Idempotent: dedupe by exact line; never delete or reorder target-owned lines. Create the file if absent.
- Accept a `DryRun` switch and print `[DRY]` instead of writing (deliberate improvement over `Ensure-GitignoreEntries`, which writes even in `-DryRun` — leave that pre-existing quirk untouched, note it as out of scope).
- Call site: `Sync-Targets`, next to `Ensure-GitignoreEntries` (`sync.ps1:260`).

### 4. cli2 config merge — sync.ps1 `Ensure-MarkdownlintCli2Ignores` (new; user's choice B)

Target root `.markdownlint-cli2.jsonc` `ignores` merge:

- Guard first: if any other cli2 config variant exists in the target root (`.markdownlint-cli2.json`, `.yaml`, `.yml`, `.cjs`, `.mjs`), `Write-Warning` and skip — creating/merging jsonc there could shadow their config (cli2 discovery picks one file).
- File absent → create with only the `ignores` array:

```jsonc
{
  // baba prompt-system sync: machine-managed content, linted upstream (managed by sync.ps1)
  "ignores": ["AGENTS.md", "**/prompt-system/**", "**/.opencode/**", "**/.kilo/**", "**/.claude/**"]
}
```

- File present → parse with the repo's established `//`-stripping + `ConvertFrom-Json` idiom (precedent: `Install-Plugins`, `sync.ps1:439-440`), append missing entries to `ignores` (create the property if absent), rewrite via `ConvertTo-Json -Depth 10` (precedent: `sync.ps1:505`). If parsing fails, `Write-Warning` and skip — never rewrite a file we failed to parse. Comment/formatting loss is the accepted cost of choice B.
- Same `DryRun` handling and call site as task 3.
- Keep the glob list in ONE shared script-scope variable in sync.ps1, derived by both ensure-functions, so `.markdownlintignore` and cli2 `ignores` cannot drift.

### 5. CWD + synopsis fix — `scripts/verify-system.ps1` (lines ~127-154)

- Line 143 invokes `--config .markdownlint.jsonc` (CWD-relative) with repo-relative file paths from line 140: from a subdirectory the config read exit-4s and files mis-resolve. Use the already-computed absolute `$mdlintConfig` (line 132) and join file paths onto `$repoRoot` for the invocation.
- Synopsis drift at lines 16-17: lint set is `AGENTS.md` + `user-guide/*.md`, not "every prompt-system/*.md".

### 6. Per-edit lint gate

After each logical edit: `Invoke-ScriptAnalyzer -Severity Error -ExcludeRule @('PSAvoidUsingWriteHost','PSAvoidGlobalVars')` on touched `.ps1` files (repo convention, pre-commit step 8); record command + real result.

## Verification plan

1. Source repo, clean index: `pwsh -NoProfile -File pre-commit.ps1` → "No staged Markdown files -- lint SKIPPED", exit 0.
2. Scratch clone WITH root config: stage a target-style `.md` → target-owned branch, `--config` to root config.
3. Scratch clone WITHOUT root config: stage a `prompt-system/` file → sync-owned branch resolves the fallback copy (no exit-4 config error); stage a non-synced `.md` → degrade warning, lint under defaults.
4. Scratch target run of sync (or direct function invocation): `.markdownlintignore` created/merged (idempotent on second run — diff before/after second run is empty); `.markdownlint-cli2.jsonc` created when absent; merged when present with our entries appended and other keys preserved; warning + no write when a `.yaml`/`.cjs` variant exists; no write when JSON is malformed.
5. `pwsh -NoProfile -File scripts/verify-system.ps1` → lint row PASS (AGENTS.md + six user-guide files); repeat from a subdirectory to confirm the CWD fix.
6. `git diff --stat` → exactly `pre-commit.ps1`, `scripts/verify-system.ps1`, `sync.ps1` changed + new `prompt-system/.markdownlint.jsonc`.
7. Rollout note (record in commit message): targets receive the new hook and merged ignore files on the next sync; re-run sync to refresh.

## Known limitations (accepted)

- Comment/formatting loss when merging an existing target `.markdownlint-cli2.jsonc` (inherent to choice B).
- Targets using non-jsonc cli2 variants keep flagging synced files until converted (warned, never shadowed).
- Multiroot VS Code workspaces have extension-specific config-discovery quirks (DavidAnson/vscode-markdownlint#285 history).
- Targets whose CI invokes markdownlint with a custom path/config not rooted at the target root are outside our reach.

## Out of scope

- Root `.markdownlint.jsonc` / `.gitignore` / `package.json` changes.
- Hook auto-installation into targets (existing `install-hooks.ps1` hint flow).
- `Ensure-GitignoreEntries`' dry-run write quirk (pre-existing; noted, not fixed).
- The stale-`scripts/` additive-copy drift issue.
