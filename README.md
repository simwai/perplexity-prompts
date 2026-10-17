# Baba Prompt System

> **Adaptive prompt system** with lightweight direct execution and a structured AI code review workflow when the task needs it.

---

## Quick Start

```powershell
# 1. Copy the prompt-system folder
Copy-Item -Recurse prompt-system <target-project>\prompt-system

# 2. Paste AGENTS.md content as AGENTS.md at target repo root
```

Then describe a task and the agent handles the rest.

---

## Documentation

| Need | Go To |
|---|---|
| 5-minute onboarding | [QUICKSTART.md](QUICKSTART.md) |
| Full setup guide | [user-guide/GETTING_STARTED.md](user-guide/GETTING_STARTED.md) |
| Which persona? | [user-guide/PERSONAS.md](user-guide/PERSONAS.md) |
| Phase flow? | [user-guide/PHASES.md](user-guide/PHASES.md) |
| Execution modes? | [user-guide/EXECUTION_MODES.md](user-guide/EXECUTION_MODES.md) |
| Troubleshooting? | [user-guide/TROUBLESHOOTING.md](user-guide/TROUBLESHOOTING.md) |
| OpenCode adapter | [AGENTS_USAGE.md](AGENTS_USAGE.md) |
| Kilo Code adapter | [KILO_USAGE.md](KILO_USAGE.md) |
| Architecture? | [ARCHITECTURE.md](ARCHITECTURE.md) |
| File map | [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) |
| AGENTS.md usage | [AGENTS_USAGE.md](AGENTS_USAGE.md) |
| Protocol invariants | [CONFORMANCE.md](CONFORMANCE.md) |
| Terminology | [GLOSSARY.md](GLOSSARY.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |
| Changelog before `v1.0.0` | [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md) |
| Spec | [project-management/specs/SPEC.md](project-management/specs/SPEC.md) |
| Tasks | [project-management/specs/TASKS.md](project-management/specs/TASKS.md) |
| Roadmaps and sprints | [project-management/ROADMAPS.md](project-management/ROADMAPS.md), [project-management/SPRINTS.md](project-management/SPRINTS.md) |
| Trello backend | [project-management/TRELLO_INTEGRATION.md](project-management/TRELLO_INTEGRATION.md) |

Canonical system files (read-only, deployed to targets):

| Need | Go To |
|---|---|
| Orchestrator, phases, hard guards | [prompt-system/00-system.md](prompt-system/00-system.md) |
| Trigger catalog | [prompt-system/11-triggers.md](prompt-system/11-triggers.md) |
| Personas and handoff contract | [prompt-system/01-personas.md](prompt-system/01-personas.md) |
| Decision format | [prompt-system/02-decision-prompts.md](prompt-system/02-decision-prompts.md) |
| Phase templates and session state | [prompt-system/03-output-and-state.md](prompt-system/03-output-and-state.md) |
| Rubrics (H1-H38, S1-S25, L1-L10) | [prompt-system/04-rubrics.md](prompt-system/04-rubrics.md) |
| Logical rubric detail | [prompt-system/04b-rubrics-logical.md](prompt-system/04b-rubrics-logical.md) |
| Implementation style | [prompt-system/05-impl-style.md](prompt-system/05-impl-style.md) |
| PATCH protocol, commit/push gate | [prompt-system/06-misc.md](prompt-system/06-misc.md) |
| Cross-cutting protocols | [prompt-system/07-protocols.md](prompt-system/07-protocols.md) |
| Plan-versus-actual gate | [prompt-system/08-plan-actual-gate.md](prompt-system/08-plan-actual-gate.md) |
| Design guidelines | [prompt-system/09-design-guidelines.md](prompt-system/09-design-guidelines.md) |
| Documentation style | [prompt-system/10-doc-style.md](prompt-system/10-doc-style.md) |
| Rule detection and enforcement | [prompt-system/rules.md](prompt-system/rules.md) |

---

## Layout

```txt
AGENTS.md              The single entry file -- paste at a target repo root
prompt-system/         The deployed unit -- 14 top-level files
                       (00-04b, 05-11, rules.md) + stacks/ + scripts/ + templates/
  stacks/              Per-language style sections (loaded on PATCH)
  scripts/             Integrity suites, session locks, reference-pool tooling
  templates/           LaTeX template for the arxiv-paper command
  personas.json        Persona registry; drives adapter generation
AGENTS_USAGE.md        How to use and deploy the system
ARCHITECTURE.md        Layer model, review path, portable vs adapter files
SYSTEM_OVERVIEW.md     File map and cross-references
CONFORMANCE.md         Protocol invariants verified before each phase transition
GLOSSARY.md            Central terminology reference
SPEC.md                Living spec and registry
TASKS.md               Build tasks mapped to spec sections
STYLE_POLICY.md        preserve-local or upgrade-house-style
QUICKSTART.md          5-minute onboarding
CHANGELOG.md           Generated changelog (from v1.0.0 forward)
CHANGELOG_ARCHIVE.md   Hand-written changelog (through v1.0.0)
LICENSE                ISC
user-guide/            Getting started, personas, phases, modes, troubleshooting
project-management/    Roadmaps, sprints, Trello integration, config
adapters/              Adapter templates (source of truth for generated files)
  opencode/agents/     OpenCode agent templates
  opencode/commands/   OpenCode command templates
  claude/agents/       Claude Code agent templates
  claude/skills/       Claude Code skill templates
  kilo/agent/          Kilo Code agent templates
  kilo/command/        Kilo Code command templates
  kilo/skills/         Kilo Code skill templates
opencode.jsonc         opencode-native config (optional layer, inert for other agents)
.opencode/             Generated: agents, commands, plugins, packages, lib, tests
.mcp.json              Generated MCP server config (shared by both platforms)
.kilo/                 Generated: agents, commands, kilo.json
opencode-memory-mw/    Memory middleware research workspace (paper + simulation)
scripts/               Bootstrap helpers (ensure-playwright, ensure-uvx, verify-plugins)
sync.ps1               Interactive propagation to target projects
generate-adapters.ps1  Generates .opencode/, .claude/, and .kilo/ from adapters/
pre-commit.ps1         The commit gate (see Contributing below)
targets.json.example   Template for sync.ps1 targets (targets.json is gitignored)
```

Only `AGENTS.md` plus `prompt-system/` is deployed to target projects by the
manual two-step copy. `sync.ps1` additionally propagates the adapter surfaces
(`.opencode/`, `.claude/`, `.kilo/`, `.mcp.json`, `kilo.json`) to configured
targets; everything else above is repository documentation and tooling and
stays local.

---

## Visual Theme

This documentation uses **dark + purple** styling:

- Mermaid diagrams with the `dark` theme, `#6B21A8` primary and `#06B6D4` cyan accent, per `prompt-system/10-doc-style.md`
- Semantic emoji only, where the glyph carries meaning the surrounding words do not
- CSS variables for HTML export (if generating a site)

---

## Prerequisites

| Tool | Minimum Version | Purpose |
|---|---|---|
| Node.js | 20+ | MCP servers (npx), Playwright |
| PowerShell | 7.6+ (pwsh) | Scripts, git ops |
| Git | 2.30+ | Version control, commit/push gate |

---

## Deploy

Copy the system into a target project in two steps:

```powershell
Copy-Item -Recurse prompt-system <target-project>\prompt-system
```

Then paste `AGENTS.md` content as `AGENTS.md` at the target repo root.

Full instructions, prerequisites, and environment setup are in
[user-guide/GETTING_STARTED.md](user-guide/GETTING_STARTED.md).

### Syncing Multiple Projects

Add project paths to `targets.json`, then run:

```powershell
.\sync.ps1 -All
```

Configured paths are included in the sync menu even before they contain
`AGENTS.md` and `prompt-system/`.

After syncing, each target that is a git repository gets the synced files
committed and pushed to its `origin` remote. Pass `-NoGitPush` (or toggle
`[G]` in the menu) to skip the commit/push step.

---

## Contributing

The repository enforces documentation quality on every commit. The gate is a
local git hook that no clone receives automatically, so install it once after
cloning:

```powershell
.\scripts\install-hooks.ps1
```

The gate runs, in order: session lock check, adapter regeneration check,
Mermaid diagram validation, prompt-system integrity suites, file hygiene,
secret scan, Markdown lint, and PowerShell Script Analyzer. The TypeScript
typecheck (`tsc --noEmit`) is deliberately not on the commit gate -- it runs at
`pre-push.ps1` because it is slow (~150s).

Adapter regeneration must be run under `pwsh` 7.6+; running
`generate-adapters.ps1` under Windows PowerShell 5.1 writes a UTF-8 BOM and the
gate will report spurious changes.

The Mermaid step renders every diagram in the staged Markdown through the real
renderer, so a diagram that would render as a syntax-error box on GitHub fails
the commit instead. Files with no diagram are skipped without starting a
browser. Run it on its own with:

```bash
npm run lint:mermaid
```

---

## Changelog

[CHANGELOG.md](CHANGELOG.md) is generated from Conventional Commits. Regenerate
with `npm run changelog`, preview with `npm run changelog:preview`. History
before `v1.0.0` is hand-written and preserved in
[CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md).

---

> **Note**: This README is the navigation hub. For the canonical system files, see `prompt-system/`.
