# test-project-documentation.ps1
# Asserts the project-documentation protocol is wired into the system corpus:
# trigger T-28 registered, the module loaded, the phase-artifact gate present in
# the hard guards and transition table, the four upstream templates carrying an
# Artifact field, and the slash-command sources free of the lowercase drift
# (config.md / roadmap-NNN.md / sprint-NNN.md) that broke on case-sensitive
# filesystems and diverged from the SPRINT phase-template schema.
#
# Exit 0 on pass, non-zero on fail.

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\test-assertions.ps1"

$systemRoot = Join-Path $PSScriptRoot '..'
$repoRoot = (Resolve-Path (Join-Path $systemRoot '..')).Path

# ── Manifest wiring ───────────────────────────────────────────────────────────
$manifestPath = Join-Path $systemRoot 'system-manifest.json'
Assert-FileExists -Path $manifestPath -Description 'system manifest (system-manifest.json)'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if (@($manifest.triggers.ids) -notcontains 'T-28') {
    Add-TestFailure "TRIGGER: system-manifest.json triggers.ids does not register T-28"
}
if (@($manifest.loadOrder.conditional) -notcontains 'prompt-system/15-project-documentation.md') {
    Add-TestFailure "LOAD ORDER: system-manifest.json loadOrder.conditional does not list prompt-system/15-project-documentation.md"
}

# ── Module presence and cited anchors ─────────────────────────────────────────
$modulePath = Join-Path $systemRoot '15-project-documentation.md'
Assert-FileExists -Path $modulePath -Description 'project documentation protocol module (15-project-documentation.md)'

foreach ($anchor in @('## Canonical scaffold', '## Phase-to-artifact gate', '## Write rules', '## Session-close protocol')) {
    Assert-FileContains -Path $modulePath -Pattern $anchor -Description "module carries anchor '$anchor' cited by other files"
}

# ── Trigger catalog entry ─────────────────────────────────────────────────────
Assert-FileContains -Path (Join-Path $systemRoot '11-triggers.md') `
    -Pattern '## T-28 -- Project documentation persistence' `
    -Description '11-triggers.md declares the T-28 entry'

# ── Orchestrator wiring ───────────────────────────────────────────────────────
$systemFile = Join-Path $systemRoot '00-system.md'
Assert-FileContains -Path $systemFile -Pattern 'prompt-system/15-project-documentation.md' `
    -Description '00-system.md names the project documentation module in its load order'
Assert-FileContains -Path $systemFile -Pattern 'T-28' `
    -Description '00-system.md names trigger T-28'
Assert-FileContains -Path $systemFile -Pattern 'NO UPSTREAM-PHASE TRANSITION' `
    -Description '00-system.md hard guards carry the upstream-phase artifact gate'

# ── Phase templates ───────────────────────────────────────────────────────────
$templatesPath = Join-Path $systemRoot '03-output-and-state.md'
$artifactCount = @(Select-String -Path $templatesPath -Pattern 'Artifact:' -SimpleMatch).Count
if ($artifactCount -lt 4) {
    Add-TestFailure "TEMPLATES: 03-output-and-state.md carries $artifactCount 'Artifact:' template lines; expected at least 4 (INTAKE, BACKLOG, SPRINT, TASK_PLAN)"
}
Assert-FileContains -Path $templatesPath -Pattern 'project-management/EVALUATIONS.md' `
    -Description '03-output-and-state.md session-close protocol names the EVALUATIONS.md artifact'
Assert-FileContains -Path $templatesPath -Pattern 'Artifacts reviewed:' `
    -Description 'session evaluation prompt carries the Artifacts reviewed line'

# ── Operational protocol wiring ───────────────────────────────────────────────
Assert-FileContains -Path (Join-Path $systemRoot '06-misc.md') -Pattern 'project-management/EVALUATIONS.md' `
    -Description '06-misc.md auto-close appends the EVALUATIONS.md entry'
Assert-FileContains -Path (Join-Path $systemRoot '07-protocols.md') -Pattern '## Project documentation' `
    -Description '07-protocols.md points at the project documentation module'

# ── Command-source drift (case-sensitive lowercase forms) ─────────────────────
$commandScopes = @(
    (Join-Path $repoRoot 'adapters\opencode\commands'),
    (Join-Path $repoRoot '.kilo\command')
)
$staleHits = @()
foreach ($dir in $commandScopes) {
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) { continue }
    $staleHits += @(Get-ChildItem -LiteralPath $dir -Filter '*.md' -File |
        ForEach-Object { Select-String -Path $_.FullName -Pattern 'config\.md|roadmap-NNN|sprint-NNN' -CaseSensitive })
}
if ($staleHits.Count -gt 0) {
    $detail = ($staleHits | Select-Object -First 5 | ForEach-Object { "$($_.Filename): $($_.Line.Trim())" }) -join '; '
    Add-TestFailure "COMMAND DRIFT: $($staleHits.Count) stale lowercase reference(s) in command sources ($detail) -- the scaffold files are CONFIG.md / ROADMAP_<YYYY-MM>.md / SPRINT_<NNN>.md"
}

# ── Scaffold invariants (only when the folder exists) ─────────────────────────
$pmRoot = Join-Path $repoRoot 'project-management'
if (Test-Path -LiteralPath $pmRoot -PathType Container) {
    Assert-FileExists -Path (Join-Path $pmRoot 'CONFIG.md') -Description 'scaffold CONFIG.md'
    Assert-FileExists -Path (Join-Path $pmRoot 'README.md') -Description 'scaffold README.md'
    Assert-FileContains -Path (Join-Path $pmRoot 'README.md') -Pattern 'UPPER_SNAKE_CASE' `
        -Description 'scaffold README documents the naming rule'
}

# ── Scaffold initializer ──────────────────────────────────────────────────────
Assert-FileExists -Path (Join-Path $systemRoot 'scripts\init-project-management.ps1') `
    -Description 'scaffold initializer script (init-project-management.ps1)'

Write-Host "  checked manifest, module anchors, orchestrator wiring, templates, command drift, scaffold"
exit (Complete-TestRun -SuiteName 'project documentation')
