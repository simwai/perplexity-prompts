# test-registry-drift.ps1
# Asserts that the persona registry (personas.json), the persona catalogue
# (01-personas.md sections), and the subagent bootstrap table (00-system.md)
# agree on the persona set.
#
# The audit found BabaCEO shipped as a spawnable agent with a command file and
# a registry entry but no persona section, no bootstrap-table row, and no
# T-21 row: every "read your persona section" instruction for CEO pointed at
# nothing. This suite makes that drift class fail at commit time instead.
#
# Exit 0 on pass, non-zero on fail.

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\test-assertions.ps1"

$systemRoot = Join-Path $PSScriptRoot '..'
$repoRoot = (Resolve-Path (Join-Path $systemRoot '..')).Path

$manifestPath = Join-Path $systemRoot 'system-manifest.json'
Assert-FileExists -Path $manifestPath -Description 'system manifest (system-manifest.json)'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

$regPath = Join-Path $repoRoot ($manifest.personas.registryFile -replace '/', '\')
Assert-FileExists -Path $regPath -Description 'persona registry'
$registry = Get-Content -LiteralPath $regPath -Raw | ConvertFrom-Json

$sectionsPath = Join-Path $repoRoot ($manifest.personas.sectionsFile -replace '/', '\')
Assert-FileExists -Path $sectionsPath -Description 'persona catalogue (01-personas.md)'

$sectionSet = @{}
foreach ($line in [System.IO.File]::ReadAllLines($sectionsPath)) {
    if ($line -match '^###\s+(.+?)\s*$') {
        $sectionSet[$Matches[1].Trim()] = $true
    }
}

# Bootstrap table: rows in 00-system.md's "Entry phase mapping" table carry a
# backticked agent id in the first column.
$bootstrapIds = @{}
$lines = [System.IO.File]::ReadAllLines((Join-Path $repoRoot ($manifest.personas.bootstrapTableFile -replace '/', '\')))
$inMapping = $false
foreach ($line in $lines) {
    if ($line -match 'Entry phase mapping') { $inMapping = $true; continue }
    if ($inMapping -and $line -match '^#{1,3}\s+') { break }
    if ($inMapping -and $line -match '^\|\s*`([a-z0-9\-]+)`\s*\|') {
        $bootstrapIds[$Matches[1]] = $true
    }
}

$missingSectionAllow = @()
if ($manifest.personas.missingSectionAllowlist) { $missingSectionAllow = @($manifest.personas.missingSectionAllowlist) }
$missingRowAllow = @()
if ($manifest.personas.missingBootstrapRowAllowlist) { $missingRowAllow = @($manifest.personas.missingBootstrapRowAllowlist) }

$personaIds = @()
foreach ($p in @($registry.personas)) {
    $personaIds += $p.id

    if (-not $sectionSet.ContainsKey($p.display)) {
        if ($missingSectionAllow -notcontains $p.display) {
            Add-TestFailure "MISSING SECTION: persona '$($p.display)' ($($p.id)) has no '### $($p.display)' section in $($manifest.personas.sectionsFile); 'read your persona section' instructions point at nothing"
        }
    }

    if (-not $bootstrapIds.ContainsKey($p.id)) {
        if ($missingRowAllow -notcontains $p.id) {
            Add-TestFailure "MISSING BOOTSTRAP ROW: persona '$($p.id)' is absent from the entry-phase mapping table in $($manifest.personas.bootstrapTableFile)"
        }
    }
}

# Every generated persona command file must correspond to a registry persona.
$commandDir = Join-Path $repoRoot '.kilo\command'
if (Test-Path -LiteralPath $commandDir -PathType Container) {
    foreach ($f in (Get-ChildItem -Path $commandDir -Filter 'baba-*.md' -File)) {
        $id = $f.BaseName
        if ($personaIds -notcontains $id) {
            Add-TestFailure "ORPHAN COMMAND: .kilo/command/$($f.Name) has no persona '$id' in the registry"
        }
    }
}

Write-Host "  registry personas: $($personaIds.Count) | catalogue sections: $($sectionSet.Count) | bootstrap rows: $($bootstrapIds.Count)"
exit (Complete-TestRun -SuiteName 'persona registry drift')
