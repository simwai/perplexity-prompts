# test-phase-graph.ps1
# Asserts that the phase-transition legality table in 00-system.md is the
# single source of truth for the phase graph, and that every phase-to-phase
# edge cited anywhere in the corpus prose exists in that table or in the
# manifest's explicit baseline allowlist.
#
# A prose-cited edge missing from the table is a protocol trap: the phase
# header gate refuses the transition, so an agent following the prose is
# breached by construction (the audit found SPRINT -> TASK_PLAN and
# HANDOFF -> PATCH in exactly that state).
#
# Exit 0 on pass, non-zero on fail.

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\test-assertions.ps1"

$systemRoot = Join-Path $PSScriptRoot '..'
$repoRoot = (Resolve-Path (Join-Path $systemRoot '..')).Path

$manifestPath = Join-Path $systemRoot 'system-manifest.json'
Assert-FileExists -Path $manifestPath -Description 'system manifest (system-manifest.json)'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

$phaseSet = @{}
foreach ($p in @($manifest.phases)) { $phaseSet[$p] = $true }
# START is a valid edge endpoint (the mandatory first transition) even though
# it is not a working phase.
$phaseSet['START'] = $true

$systemFile = Join-Path $systemRoot '00-system.md'
$lines = [System.IO.File]::ReadAllLines($systemFile)

# 1. Parse the legality table (### Transition rules ... until the next ###).
$edgeRegex = [regex]'(?<![A-Za-z-])([A-Z][A-Z_]{2,})\s+->\s+([A-Z][A-Z_]{2,})'
$tableEdges = @{}
$inTable = $false
foreach ($line in $lines) {
    if ($line -match '^#{2,3}\s+.*Transition rules') { $inTable = $true; continue }
    if ($inTable -and $line -match '^#{2,3}\s+') { break }
    if (-not $inTable) { continue }
    if ($line -match 'ANY PHASE') { continue }
    foreach ($m in $edgeRegex.Matches($line)) {
        $from = $m.Groups[1].Value
        $to = $m.Groups[2].Value
        $tableEdges["$from -> $to"] = $true
    }
}

if ($tableEdges.Count -eq 0) {
    Add-TestFailure 'TABLE EMPTY: no "A -> B" edges parsed from 00-system.md transition rules table'
}

# 2. Table endpoints must be known phases (catches phase-set drift, e.g. a
#    transition naming a phase the manifest phase set omits).
foreach ($edge in $tableEdges.Keys) {
    $parts = $edge -split ' -> '
    foreach ($p in $parts) {
        if (-not $phaseSet.ContainsKey($p)) {
            Add-TestFailure "UNKNOWN PHASE: table edge '$edge' names '$p' which is not in manifest.phases"
        }
    }
}

# 3. Every phase-to-phase edge cited in corpus prose must be a legal edge.
$allow = @()
if ($manifest.transitionEdgeAllowlist) { $allow = @($manifest.transitionEdgeAllowlist) }

$scanFiles = @(Get-ChildItem -Path $systemRoot -Recurse -Filter '*.md' -File)
$agentsPath = Join-Path $repoRoot 'AGENTS.md'
if (Test-Path -LiteralPath $agentsPath -PathType Leaf) { $scanFiles += Get-Item $agentsPath }

$proseEdges = @{}
$cited = 0
foreach ($file in $scanFiles) {
    $rel = $file.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
    $inTableSection = $false
    foreach ($line in [System.IO.File]::ReadAllLines($file.FullName)) {
        if ($rel -eq 'prompt-system\00-system.md' -or $rel -eq 'prompt-system/00-system.md') {
            if ($line -match '^#{2,3}\s+.*Transition rules') { $inTableSection = $true; continue }
            if ($inTableSection -and $line -match '^#{2,3}\s+') { $inTableSection = $false }
            if ($inTableSection) { continue }
        }
        foreach ($m in $edgeRegex.Matches($line)) {
            $from = $m.Groups[1].Value
            $to = $m.Groups[2].Value
            if (-not $phaseSet.ContainsKey($from) -or -not $phaseSet.ContainsKey($to)) { continue }
            $edge = "$from -> $to"
            $cited++
            if ($tableEdges.ContainsKey($edge)) { continue }
            if ($allow -contains $edge) { continue }
            $proseEdges[$edge] = $true
        }
    }
}

foreach ($edge in $proseEdges.Keys) {
    Add-TestFailure "ILLEGAL EDGE: '$edge' is cited in corpus prose but missing from the 00-system.md transition table (and not in the manifest baseline allowlist)"
}

Write-Host "  table edges: $($tableEdges.Count) | prose-cited phase edges: $cited | illegal: $($proseEdges.Count) | baseline allowlist: $($allow.Count)"
exit (Complete-TestRun -SuiteName 'phase graph integrity')
