# Command & Skill Rationalization

## Objective

Close the gap between prompt-system phases and their command/skill entry points, and remove commands that don't align with the session-state model. Add explicit entry points for DRIFT, CHECKLIST, DOCS, SPEC, and DISCUSS phases/operations; remove the `resume` command and skill.

## Single source of truth

`generate-adapters.ps1` is the single generator. It reads source templates from `adapters/` and writes generated output to `.kilo/`, `.opencode/`, `.claude/`, `kilo.json`, and `.mcp.json`. Nothing in `.kilo/` is hand-maintained.

| Generated output | Source template | Transformation |
|------------------|----------------|----------------|
| `.kilo/agent/*.md` | `adapters/opencode/agents/*.md` | Drop `skill`/`task` frontmatter keys; add `color` from `prompt-system/personas.json` |
| `.kilo/command/*.md` | `adapters/opencode/commands/*.md` | Drop `argument-hint`; inject `agent` + `subtask` after `description` |
| `.kilo/skills/*/SKILL.md` | `adapters/kilo/skills/*/SKILL.md` | Copied as-is (no transformation) |
| `kilo.json` | `opencode.jsonc` | Extract `instructions`, `default_agent`, `small_model`, `permission`, `mcp`; add `$schema` |
| `.mcp.json` | `opencode.jsonc` mcp block | Translate `local`→`stdio`, `remote`→`http`; resolve env headers |

`adapters/kilo/agent/` and `adapters/kilo/command/` do NOT exist — there is no Kilo-specific agent/command template layer. All `.kilo/agent/` and `.kilo/command/` content flows from `adapters/opencode/`.

## Background (verified)

- Session IDs ARE generated per-process at startup (`prompt-system/00-system.md` line 77: `session-<timestamp>-<PID>-<random>`), stored in session context `session_id`, used for lock operations and approval restore matching.
- `consensus`, `feedback`/`feedback-status`, `code-ref`, `arxiv-paper` are all backed by real plugins/scripts/templates — not nonsense.
- `resume` is file-based (reads `SPEC.md`/`TASKS.md` from disk), not session-ID-based, and does not align with the conversation-carrier state model. Remove it.

## Removal

### `resume` command and skill

**Remove:**

- `adapters/opencode/commands/resume.md` (source template)
- `.kilo/command/resume.md` (generated)
- `adapters/kilo/skills/resume/SKILL.md` (source template)
- `.kilo/skills/resume/SKILL.md` (generated)

**Rationale:** `resume` reads `SPEC.md`/`TASKS.md` from disk to reconstruct phase state, but session state lives in the conversation carrier (per `prompt-system/00-system.md` `## Session State`). There is no disk persistence of phase state to resume from. The command duplicates what `/phase <name>` + reading SPEC.md/TASKS.md already does informally.

## Additions

### New commands (source: `adapters/opencode/commands/`)

| Command | Phase/Operation | Purpose |
|---------|----------------|---------|
| `/drift` | DRIFT | Enter read-only spec-vs-code comparison phase |
| `/checklist` | CHECKLIST | Enter review entry phase; run relevance discovery, populate file inventory |
| `/docs` | DOCS | Enter dependency evidence recording phase |
| `/spec` | SPEC | Enter spec artifact authoring phase |
| `/discuss` | DISCUSS | Enter exploratory discussion mode |

Each command follows the existing command pattern: YAML frontmatter (`description`, `agent: code`, `subtask: true`) + markdown body referencing the relevant `prompt-system/` section.

### New skills (source: `adapters/kilo/skills/`)

| Skill | Purpose | Model invocation |
|-------|---------|------------------|
| `drift` | Execute DRIFT phase | disabled |
| `checklist` | Enter CHECKLIST phase + discovery | disabled |
| `docs` | Execute DOCS phase | disabled |
| `spec` | Enter SPEC phase | disabled |
| `discuss` | Enter DISCUSS mode | disabled |

Each skill follows the existing `SKILL.md` pattern: YAML frontmatter (`name`, `description`, `argument-hint`, `disable-model-invocation: true`) + markdown body with Before acting / Then steps.

## Tasks

### 1. Remove `resume`

- [x] Delete `adapters/opencode/commands/resume.md`
- [x] Delete `.kilo/command/resume.md`
- [x] Delete `adapters/kilo/skills/resume/SKILL.md`
- [x] Delete `.kilo/skills/resume/SKILL.md`
- [x] Remove empty `resume/` directories from `adapters/kilo/skills/` and `.kilo/skills/`

### 2. Create new command source templates

- [x] `adapters/opencode/commands/drift.md`
- [x] `adapters/opencode/commands/checklist.md`
- [x] `adapters/opencode/commands/docs.md`
- [x] `adapters/opencode/commands/spec.md`
- [x] `adapters/opencode/commands/discuss.md`

### 3. Create new skill source templates

- [x] `adapters/kilo/skills/drift/SKILL.md`
- [x] `adapters/kilo/skills/checklist/SKILL.md`
- [x] `adapters/kilo/skills/docs/SKILL.md`
- [x] `adapters/kilo/skills/spec/SKILL.md`
- [x] `adapters/kilo/skills/discuss/SKILL.md`

### 4. Regenerate adapters

- [x] Run `generate-adapters.ps1` to regenerate `.kilo/command/` and `.kilo/skills/`
- [x] Verify `.kilo/command/drift.md`, `checklist.md`, `docs.md`, `spec.md`, `discuss.md` exist
- [x] Verify `.kilo/command/resume.md` is gone
- [x] Verify `.kilo/skills/drift/`, `checklist/`, `docs/`, `spec/`, `discuss/` exist with SKILL.md
- [x] Verify `.kilo/skills/resume/` is gone

### 5. Update documentation

- [x] Update `KILO_USAGE.md` command table to add the 5 new commands and remove `resume`
- [x] Update `KILO_USAGE.md` skills table to add the 5 new skills and remove `resume`
- [x] Check `AGENTS_USAGE.md` for `resume` references (none found)

## Out of scope

- Do not edit `prompt-system/` system files (protected).
- Do not edit `generate-adapters.ps1` (no generator changes needed).
- Do not remove any other commands — `consensus`, `feedback`, `feedback-status`, `code-ref`, `arxiv-paper`, `diagnose` are all backed by real implementations.
- Do not implement changes directly — this plan is for an implementation-capable agent to execute.
- Do not create `adapters/kilo/agent/` or `adapters/kilo/command/` — `.kilo/agent/` and `.kilo/command/` are generated from `adapters/opencode/`, so Kilo-specific agent/command templates do not belong there.

## Known discrepancy

The earlier plan file `1792015333036-add-kilo-code-adapter-support.md` has a source-of-truth mapping table claiming `.kilo/agent/*.md` comes from `adapters/kilo/agent/*.md` and `.kilo/command/*.md` from `adapters/kilo/command/*.md`. That mapping is incorrect — `generate-adapters.ps1` actually generates both from `adapters/opencode/`. `adapters/kilo/agent/` and `adapters/kilo/command/` do not exist. The correct mapping is documented above.

## Validation

1. `generate-adapters.ps1` runs without errors.
2. `.kilo/command/` contains the 5 new commands and does not contain `resume.md`.
3. `.kilo/skills/` contains the 5 new skill directories and does not contain `resume/`.
4. All new command files have valid YAML frontmatter (`description`, `agent`, `subtask`).
5. All new skill files have valid YAML frontmatter (`name`, `description`, `argument-hint`, `disable-model-invocation`).
6. `KILO_USAGE.md` command and skills tables are updated.
