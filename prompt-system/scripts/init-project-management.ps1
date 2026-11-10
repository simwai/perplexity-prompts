<#
.SYNOPSIS
    Initializes the project-management/ scaffold deterministically and idempotently.
.DESCRIPTION
    Creates the canonical scaffold files that are missing -- CONFIG.md, README.md,
    ROADMAPS.md, SPRINTS.md -- and never overwrites, renames, or reformats an
    existing file. Adopt-and-extend: a repo that already carries a scaffold keeps
    it, and only the missing pieces are filled in.

    Trigger: INTAKE entry in full mode when project-management/ does not exist
    (T-28, prompt-system/15-project-documentation.md ## Scaffold initialization).

    Specs are NOT created here: specs/SPEC.md and specs/TASKS.md are written by
    the SPEC phase and the planning session, not by scaffold init.

    Writes UTF-8 without BOM (matches the repository's File.WriteAllText usage in
    pre-commit.ps1, which avoids the PS 5.1 console-encoding corruption).

.EXAMPLE
    pwsh -NoProfile -File prompt-system/scripts/init-project-management.ps1
#>

param(
    [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
    throw "init-project-management: repo root not found at $RepoRoot"
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

$scaffold = [ordered]@{
    'CONFIG.md' = @'
---
backend: file
---

# Project Management Config

## Backend Selection

- `file` -- use `project-management/` folder as source of truth (default)
- `trello` -- use Trello MCP as source of truth

## Trello Setup

When `backend: trello`, the following must be configured:

- Trello MCP OAuth consent completed via `opencode mcp auth trello`
- Board ID or board name specified in `board` field below

## Fields

- `board` (string, optional) -- Trello board name or ID (used when backend is `trello`)
- `default_lists` (array) -- Default list names when creating a new board
'@

    'README.md' = @'
# Project Management

Source of truth for roadmaps, backlogs, and sprint plans.

## Backend

Configured in [CONFIG.md](CONFIG.md). Default is `file` (local markdown files). When `backend: trello`, the Trello MCP server is used instead. See [TRELLO_INTEGRATION.md](TRELLO_INTEGRATION.md) for the Trello setup.

## Structure

Files in this directory are `UPPER_SNAKE_CASE`, matching the repository naming rule in `prompt-system/10-doc-style.md`.

| File | Purpose |
|---|---|
| [CONFIG.md](CONFIG.md) | Backend selection and Trello board settings |
| [ROADMAPS.md](ROADMAPS.md) | Index of roadmaps |
| `ROADMAP_<YYYY-MM>.md` | One roadmap per active period |
| [BACKLOG.md](BACKLOG.md) | Milestone map and ICE-scored backlog items |
| [SPRINTS.md](SPRINTS.md) | Index of sprint plans |
| `SPRINT_<NNN>.md` | One sprint plan per sprint |
| `specs/SPEC.md` | Spec artifact (SPEC phase) |
| `specs/TASKS.md` | Task table (planning session) |
| [EVALUATIONS.md](EVALUATIONS.md) | Append-only session log (session close) |
| [TRELLO_INTEGRATION.md](TRELLO_INTEGRATION.md) | Trello backend configuration |
| [FUTURE_ENHANCEMENTS.md](FUTURE_ENHANCEMENTS.md) | Deferred work and re-enablement conditions |

Note the filename casing: `CONFIG.md` is uppercase. A reference to `config.md` breaks on any case-sensitive filesystem.

## Commands

| Command | Purpose |
|---|---|
| `/create-roadmap` | Create a new roadmap |
| `/edit-roadmap` | Edit an existing roadmap |
| `/create-sprint-phase-plan` | Create a sprint plan from a roadmap |
| `/edit-sprint-phase-plan` | Edit an existing sprint plan |
| `/check-sprint-progress` | Report sprint progress |
| `/check-for-blockers` | Identify blockers across sprints |

## Switching Backends

Edit [CONFIG.md](CONFIG.md) and change `backend: file` to `backend: trello`. No data migration needed -- files stay as archives, Trello becomes the active store.
'@

    'ROADMAPS.md' = @'
# ROADMAPS

> **Roadmaps** -- Index of the roadmaps.

---

## Roadmaps

| Roadmap | Period | Goal | Status |
|---|---|---|---|

## Related

- Backlog: [BACKLOG.md](BACKLOG.md)

- Overview: [README.md](README.md)
'@

    'SPRINTS.md' = @'
# SPRINTS

> **Sprint plans** -- Index of the sprint plans.

---

## Sprints

| Sprint | Duration | Goal | Board |
|---|---|---|---|

## Related

- Roadmaps: [ROADMAPS.md](ROADMAPS.md)

- Overview: [README.md](README.md)
'@

    'TRELLO_INTEGRATION.md' = @'
# TRELLO_INTEGRATION

Setup notes for the Trello backend.

## When to use

Set `backend: trello` in [CONFIG.md](CONFIG.md) when the team tracks planning state on a Trello board instead of files. The file scaffold stays as the archive of record.

## Setup

1. Complete OAuth consent: `opencode mcp auth trello`
2. Record the board name or ID in `CONFIG.md` under the `board` field.
3. Map the roadmap lanes (Backlog, Planned, In Progress, Done) to Trello lists.

## Rules

- `specs/SPEC.md`, `specs/TASKS.md`, and `EVALUATIONS.md` remain files in every mode: they are protocol artifacts, not board state.
- Board and list ids are recorded in `CONFIG.md` so the file scaffold can be rebuilt from the board.
'@

    'FUTURE_ENHANCEMENTS.md' = @'
# FUTURE_ENHANCEMENTS

Deferred work and the conditions that re-enable it.

## Deferred items

| Item | Deferred on | Re-enablement condition |
|---|---|---|
'@
}

$pmRoot = Join-Path $RepoRoot 'project-management'
if (-not (Test-Path -LiteralPath $pmRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $pmRoot -Force | Out-Null
    Write-Host "  created directory: project-management/"
}

$created = @()
$skipped = @()
foreach ($name in $scaffold.Keys) {
    $path = Join-Path $pmRoot $name
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $skipped += $name
        continue
    }
    [System.IO.File]::WriteAllText($path, $scaffold[$name], $utf8NoBom)
    $created += $name
}

if ($created.Count -gt 0) {
    Write-Host "  created: $($created -join ', ')"
}
if ($skipped.Count -gt 0) {
    Write-Host "  adopted (already exists): $($skipped -join ', ')"
}
Write-Host "init-project-management: $($created.Count) created, $($skipped.Count) adopted -- scaffold ready at project-management/"
exit 0
