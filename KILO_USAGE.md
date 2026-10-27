# Kilo Code Adapter Guide

> **First-class adapter** for the Kilo Code AI coding agent. Mirrors the OpenCode adapter pattern with Kilo-specific conventions.

---

## Quick Start

The Baba prompt system works with Kilo Code out of the box. After deploying the portable unit (`AGENTS.md` + `prompt-system/`) to your target project, Kilo Code reads:

- `kilo.json` — Configuration (generated from `opencode.jsonc`)
- `.kilo/agent/*.md` — Persona agent definitions (generated from OpenCode templates)
- `.kilo/command/*.md` — Slash commands (generated from OpenCode templates)
- `.kilo/skills/*/SKILL.md` — Skill definitions (explicit templates, mirror Claude)
- `AGENTS.md` — Shared entry point

**No additional setup required** beyond the standard deploy:

```powershell
# 1. Deploy portable system
Copy-Item -Recurse prompt-system <target-project>\prompt-system

# 2. Paste AGENTS.md content as AGENTS.md at target repo root

# 3. Generate adapters (run in Baba repo, then sync)
.\generate-adapters.ps1
.\sync.ps1 -All
```

---

## How Adapters Are Generated (Single Source of Truth)

Kilo Code adapters are **generated**, not hand-maintained. This keeps a single source of truth for agent and command bodies:

| Generated | Source | Transformation |
|---|---|---|
| `.kilo/agent/*.md` | `adapters/opencode/agents/*.md` | Frontmatter: `+ color` (from `personas.json`), `- skill/task` permissions |
| `.kilo/command/*.md` | `adapters/opencode/commands/*.md` | Frontmatter: `+ agent/subtask`, `- argument-hint` |
| `.kilo/skills/*/SKILL.md` | `adapters/kilo/skills/*/SKILL.md` | Explicit templates (mirror Claude Code skills) |
| `kilo.json` | `opencode.jsonc` | Extract `instructions`, `permission`, `mcp`, `model`; set Kilo `$schema`; drop `plugins` |

To change a persona or command, edit the **OpenCode** template (or `personas.json` for colors), then re-run `generate-adapters.ps1`. Both platforms update together.

---

## Adapter Structure

```text
<target-project>/
├── AGENTS.md              # Portable entry point (shared)
├── prompt-system/         # Portable system (shared)
├── kilo.json              # Kilo Code config (generated from opencode.jsonc)
├── .kilo/
│   ├── agent/             # 8 persona agents + 3 router agents + explore (generated)
│   │   ├── baba-sensei.md
│   │   ├── baba-dev.md
│   │   ├── baba-tester.md
│   │   ├── baba-reviewer.md
│   │   ├── baba-scrum.md
│   │   ├── baba-designer.md
│   │   ├── baba-ceo.md
│   │   ├── ultra-pro-quant.md
│   │   ├── explore.md
│   │   ├── plan.md        # Persona routing
│   │   ├── build.md       # Build routing
│   │   └── general.md     # General comparison table
│   ├── command/           # 26 slash commands (generated)
│   │   ├── auto.md
│   │   ├── baba.md
│   │   ├── kickoff.md
│   │   ├── phase.md
│   │   ├── resume.md
│   │   ├── handoff.md
│   │   ├── check-for-blockers.md
│   │   ├── check-sprint-progress.md
│       ├── create-roadmap.md
│       ├── create-sprint-phase-plan.md
│       ├── edit-roadmap.md
│       ├── edit-sprint-phase-plan.md
│       ├── approve-plan.md
│       ├── review-consolidated.md
│       ├── review-interactive.md
│       ├── verify.md
│       ├── smoke.md
│       ├── code-ref.md
│       ├── close.md
│       ├── direct.md
│       ├── structured.md
│       ├── consensus.md
│       ├── feedback.md
│       ├── feedback-status.md
│       ├── reddit-post.md
│       └── arxiv-paper.md
│   └── skills/             # 6 skills (explicit templates, mirror Claude Code)
│       ├── verify/SKILL.md
│       ├── phase/SKILL.md
│       ├── smoke/SKILL.md
│       ├── handoff/SKILL.md
│       ├── resume/SKILL.md
│       └── approve-plan/SKILL.md
```

---

## Key Differences: Kilo Code vs OpenCode

| Aspect | OpenCode | Kilo Code |
|--------|----------|-----------|
| Config file | `opencode.jsonc` | `kilo.json` (generated) |
| Agent dir | `.opencode/agents/` | `.kilo/agent/` |
| Command dir | `.opencode/commands/` | `.kilo/command/` |
| Agent frontmatter | `mode: primary/subagent` | `mode: primary/subagent/all` |
| Agent permission | `edit: allow/deny` | `edit: allow/ask/deny` |
| Agent color | Not supported | Supported (`color: "#RRGGBB"`) |
| Command frontmatter | `description`, `argument-hint`, `agent` | `description`, `agent`, `subtask`, `variant` |
| Template vars | `$ARGUMENTS` | `$ARGUMENTS`, `$1`, `$2`, `!CMD` |

---

## Personas (`.kilo/agent/*.md`)

Each persona agent has a YAML frontmatter:

```yaml
---
description: When to use this agent
mode: primary | subagent | all
temperature: 0.1
color: "#RRGGBB"
permission:
  edit: allow | deny | ask
  bash: allow | deny | ask
  webfetch: allow | deny | ask
---
```

**Persona colors (Catppuccin Mocha):**

| Persona | Color | Hex |
|---------|-------|-----|
| baba-sensei | Red | `#f38ba8` |
| baba-dev | Sapphire | `#74c7ec` |
| baba-tester | Peach | `#fab387` |
| baba-reviewer | Red | `#f38ba8` |
| baba-scrum | Green | `#a6e3a1` |
| baba-designer | Pink | `#f5c2e7` |
| baba-ceo | Lavender | `#b4befe` |
| ultra-pro-quant | Yellow | `#f9e2af` |
| explore | Blue | `#89b4fa` |

---

## Commands (`.kilo/command/*.md`)

Commands use Kilo Code frontmatter:

```yaml
---
description: Human-readable description
agent: code
subtask: true | false
variant: optional
---
```

**Key commands:**

| Command | Purpose | Agent | Subtask |
|---------|---------|-------|---------|
| `/baba <persona>` | Activate a Baba persona | `code` | `true` |
| `/kickoff <goal>` | Full PM pipeline bootstrap | `code` | `true` |
| `/phase <name>` | Enter structured phase | `code` | `false` |
| `/handoff` | Emit persona handoff contract | `code` | `false` |
| `/approve-plan` | Record plan approval | `code` | `false` |
| `/verify` | Run verification gate | `build` | `true` |
| `/smoke` | Playwright smoke test | `code` | `true` |
| `/code-ref` | Lookup/caching reference pool | `code` | `true` |
| `/review-consolidated` | Switch to consolidated REVIEW | `code` | `false` |
| `/review-interactive` | Switch to interactive REVIEW | `code` | `false` |
| `/drift` | Enter DRIFT phase (spec-vs-code comparison) | `code` | `false` |
| `/checklist` | Enter CHECKLIST phase (inventory + rubrics) | `code` | `false` |
| `/docs` | Enter DOCS phase (dependency evidence) | `code` | `false` |
| `/spec` | Enter SPEC phase (spec artifact authoring) | `code` | `false` |
| `/discuss` | Enter DISCUSS mode (exploratory conversation) | `code` | `false` |

---

## Skills (`.kilo/skills/<name>/SKILL.md`)

Kilo Code supports skills — markdown files discovered inside `.kilo/` at `skills/<name>/SKILL.md` (or `skill/<name>/SKILL.md`). The Baba system ports ten Claude Code skills as explicit templates in `adapters/kilo/skills/`.

| Skill | Purpose | Model invocation |
|-------|---------|------------------|
| `verify` | Run verification gates (diff, project checks, commit/push gate) | Disabled (`disable-model-invocation: true`) |
| `phase` | Enter a structured Baba phase by name | Disabled |
| `smoke` | Playwright MCP smoke-test plan + immediate execution | Enabled |
| `handoff` | Emit a complete persona handoff contract | Disabled |
| `approve-plan` | Record plan approval + rewrite contract | Disabled |
| `drift` | Enter DRIFT phase (spec-vs-code comparison) | Disabled |
| `checklist` | Enter CHECKLIST phase (inventory + rubrics) | Disabled |
| `docs` | Enter DOCS phase (dependency evidence) | Disabled |
| `spec` | Enter SPEC phase (spec artifact authoring) | Disabled |
| `discuss` | Enter DISCUSS mode (exploratory conversation) | Disabled |

Skills can also be extended from extra directories or remote URLs via `kilo.json`:

```json
{
  "skills": {
    "paths": ["./my-skills", "~/shared-skills"],
    "urls": ["https://example.com/.well-known/skills/"]
  }
}
```

---

## Configuration (`kilo.json`)

Generated from `opencode.jsonc` by `generate-adapters.ps1`. Contains:

```json
{
  "$schema": "https://app.kilo.ai/config.json",
  "mcp": { ... },
  "permission": {
    "doom_loop": "deny",
    "git_remote": "deny",
    "git_push_force": "deny",
    "env_files": "deny",
    "pem_files": "deny",
    "key_files": "deny"
  },
  "model": "kilo",
  "small_model": "step-5-preview-free",
  "default_agent": "plan",
  "instructions": [
    "AGENTS.md",
    "prompt-system/00-system.md",
    "prompt-system/11-triggers.md",
    ...
  ]
}
```

OpenCode-only fields (`plugins`, `$schema` pointing at opencode.ai) are dropped or replaced during generation — `kilo.json` carries the Kilo schema URL.

**MCP servers** are identical to OpenCode (same format: `local`/`remote`, `command`/`url`, `env`, `headers`, `oauth`, `timeout`).

---

## Execution Modes

Same as OpenCode, adapted for Kilo Code:

- `AUTO` — Default. Agent classifies risk and chooses mode.
- `DIRECT` — `[MODE: DIRECT]`. Clear, low-risk tasks. No phase templates.
- `STRUCTURED` — `[PHASE: <name>]`. Full phase model with templates.

Switch modes with:

- `/auto` — `AUTO`
- `/direct` — `DIRECT`
- `/structured` — `STRUCTURED`

---

## Sync Workflow

Kilo Code adapter files are included in the standard sync:

```powershell
# Generate adapters (includes Kilo Code)
.\generate-adapters.ps1

# Sync to all configured targets
.\sync.ps1 -All
```

The sync includes:

- `kilo.json`
- `.kilo/agent/`
- `.kilo/command/`

---

## Troubleshooting

### `kilo.json` not generated

Ensure `opencode.jsonc` exists at repo root and `generate-adapters.ps1` runs without errors.

### Commands not recognized

Check that `.kilo/command/` exists and contains `.md` files. Kilo Code auto-discovers commands from this directory.

### Personas not spawning

Verify `.kilo/agent/*.md` files have valid YAML frontmatter. Check Kilo Code logs for parsing errors.

### Task tool reports "Unknown agent type" for `baba-*` personas

The `task` tool rejects a `subagent_type` when Kilo has not registered the project's custom agents. Check, in order:

1. **Stale Kilo process** -- Kilo scans `.kilo/agent/` at session start. If the adapter files were synced after the session (or the Kilo process) started, restart the session so the agents are re-registered.
2. **Wrong working directory** -- project config directories are discovered walking up from the session's CWD to the worktree root. A session started in an unrelated directory (or a worktree without `.kilo/` committed) sees no custom agents.
3. **Frontmatter validity** -- every spawnable agent needs `mode: subagent` (or `all`) in its frontmatter. `mode: primary` agents are not reachable via the `task` tool.
4. **Unsubstituted template placeholders** -- search the generated agents for `{{` (for example `rg "{{" .kilo/agent/`). A literal placeholder means `generate-adapters.ps1` token substitution missed that file; regenerate and re-sync.

When the spawn fails, the prompt system's inline fallback executes the reviewer inline and records the degradation -- the session still closes, but the evaluation is the session's own gate record, not an independent audit. Fix the registration cause and re-run the evaluation if an independent verdict matters.

### MCP servers not connecting

Check `kilo.json` `mcp` block matches `opencode.jsonc`. Kilo Code uses the same MCP format as OpenCode.

---

## Reference

- [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) — File map and cross-references
- [ARCHITECTURE.md](ARCHITECTURE.md) — Layer model and review path
- [AGENTS_USAGE.md](AGENTS_USAGE.md) — OpenCode adapter guide (similar patterns)
- [prompt-system/01-personas.md](prompt-system/01-personas.md) — Persona definitions
- [prompt-system/03-output-and-state.md](prompt-system/03-output-and-state.md) — Phase templates
