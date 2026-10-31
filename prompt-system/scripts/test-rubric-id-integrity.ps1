# test-rubric-id-integrity.ps1
# Asserts that every H/S/L rubric id maps to exactly one title across the
# prompt-system, that the registries are contiguous (H1-H38, S1-S25, L1-L10),
# and that no file cites a rubric id the registries omit.
#
# 04-rubrics.md is the sole authority for which number belongs to which rule.
# prompt-system/rules.md supplies detection and enforcement for H13-H38 and
# must never disagree about the title. A disagreement here is silent breakage:
# an agent asked to enforce "H33" may run the wrong rule.
#
# Bounds and scan dirs come from system-manifest.json. H20a-d sub-check
# assertions activate via manifest.rubrics.h20SubIdsEnforced.
#
# Exit 0 on pass, non-zero on fail.

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\test-assertions.ps1"

$systemRoot = Join-Path $PSScriptRoot '..'
$repoRoot = (Resolve-Path (Join-Path $systemRoot '..')).Path

$manifestPath = Join-Path $systemRoot 'system-manifest.json'
Assert-FileExists -Path $manifestPath -Description 'system manifest (system-manifest.json)'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

# The registries: definitions look like **H33 -- No Magic Values: fix ...
# Two shapes exist. Most titles end at the first colon; H11 closes the bold
# run before its colon, so stop at whichever comes first.
$registryPath = Join-Path $systemRoot '04-rubrics.md'
Assert-FileExists -Path $registryPath -Description 'rubric registry (04-rubrics.md)'
$registryText = [System.IO.File]::ReadAllText($registryPath)

$hard = @{}
foreach ($m in [regex]::Matches($registryText, '(?m)^\*\*H(\d+) -- (.+?)\s*\*\*')) {
    $hard[[int]$m.Groups[1].Value] = $m.Groups[2].Value.Trim().TrimEnd('.')
}
$soft = @{}
foreach ($m in [regex]::Matches($registryText, '(?m)^\*\*S(\d+) -- (.+?)\s*\*\*')) {
    $soft[[int]$m.Groups[1].Value] = $m.Groups[2].Value.Trim().TrimEnd('.')
}
$logical = @{}
foreach ($m in [regex]::Matches($registryText, '(?m)^\*\*L(\d+) -- (.+?)\s*\*\*')) {
    $logical[[int]$m.Groups[1].Value] = $m.Groups[2].Value.Trim().TrimEnd('.')
}

$hardMax = [int]$manifest.rubrics.hardMax
$softMax = [int]$manifest.rubrics.softMax
$logicalMax = [int]$manifest.rubrics.logicalMax

# Registry count and contiguity: every id inside the declared range must be
# defined, and no id may be defined beyond the declared max. Both directions
# catch the real failure mode: a range string ("H1-H38") that survives after
# the underlying registry grew or shrank.
if ($hard.Count -ne $hardMax) {
    Add-TestFailure "REGISTRY COUNT: 04-rubrics.md defines $($hard.Count) H ids, manifest hardMax is $hardMax"
}
foreach ($space in @(@{Name = 'H'; Map = $hard; Max = $hardMax }, @{Name = 'S'; Map = $soft; Max = $softMax }, @{Name = 'L'; Map = $logical; Max = $logicalMax })) {
    for ($i = 1; $i -le $space.Max; $i++) {
        if (-not $space.Map.ContainsKey($i)) {
            Add-TestFailure "REGISTRY GAP: $($space.Name)$i is inside the declared range but 04-rubrics.md does not define it"
        }
    }
}
foreach ($id in $hard.Keys)   { if ($id -gt $hardMax)     { Add-TestFailure "OUT OF RANGE: H$id defined in 04-rubrics.md but manifest hardMax is $hardMax" } }
foreach ($id in $soft.Keys)   { if ($id -gt $softMax)     { Add-TestFailure "OUT OF RANGE: S$id defined in 04-rubrics.md but manifest softMax is $softMax" } }
foreach ($id in $logical.Keys){ if ($id -gt $logicalMax)  { Add-TestFailure "OUT OF RANGE: L$id defined in 04-rubrics.md but manifest logicalMax is $logicalMax" } }

# Canary spot checks (kept from the original suite).
Assert-FileContains -Path $registryPath -Pattern '**H1 -- Security:' -Description 'H1 present in registry'
Assert-FileContains -Path $registryPath -Pattern ('**H' + $hardMax + ' -- ') -Description ('H' + $hardMax + ' present in registry (no gap above it)')

# 1. The detail layer owns H13-Hmax only; H1-H12 carry no rules.md section by design.
$detailPath = Join-Path $systemRoot 'rules.md'
Assert-FileExists -Path $detailPath -Description 'detail layer (rules.md)'

$detail = @{}
foreach ($m in [regex]::Matches([System.IO.File]::ReadAllText($detailPath), '(?m)^## H(\d+) -- (.+)$')) {
    $detail[[int]$m.Groups[1].Value] = $m.Groups[2].Value.Trim()
}

foreach ($id in ($detail.Keys | Sort-Object)) {
    if ($id -lt 13) {
        Add-TestFailure "OUT OF RANGE: rules.md defines H$id; the detail layer owns H13-H$hardMax only"
        continue
    }
    if (-not $hard.ContainsKey($id)) {
        Add-TestFailure "ORPHAN IN DETAIL: rules.md defines H$id ($($detail[$id])) which 04-rubrics.md does not define"
    }
}

foreach ($id in ($hard.Keys | Sort-Object)) {
    if ($id -lt 13) { continue }
    if (-not $detail.ContainsKey($id)) {
        Add-TestFailure "MISSING IN DETAIL: H$id ($($hard[$id])) has no '## H$id -- ...' section in rules.md"
        continue
    }
    if ($detail[$id] -ne $hard[$id]) {
        Add-TestFailure "TITLE MISMATCH: H$id is '$($hard[$id])' in 04-rubrics.md but '$($detail[$id])' in rules.md"
    }
}

# H20 sub-checks: the registry advertises H20a-d; the detail layer must
# implement every advertised sub-check. Gated by the manifest flag so the
# assertion can land before the rules.md fix and be switched on with it.
if ($manifest.rubrics.h20SubIdsEnforced) {
    foreach ($sub in @($manifest.rubrics.h20SubIds)) {
        Assert-FileContains -Path $detailPath -Pattern $sub -Description "H20 sub-check $sub implemented in rules.md"
    }
} else {
    Write-Warning '  H20a-d sub-check assertions SKIPPED (manifest.rubrics.h20SubIdsEnforced is false)'
}

# 2. No file may cite an H/S/L id the registries omit or that is out of range.
#    Scan dirs come from the manifest so a moved directory fails loudly here
#    instead of being silently skipped.
$scanFiles = @(Get-ChildItem -Path $systemRoot -Recurse -Filter '*.md' -File)
foreach ($dir in @($manifest.scanDirs)) {
    $dirPath = Join-Path $repoRoot ($dir -replace '/', '\')
    if (-not (Test-Path -LiteralPath $dirPath -PathType Container)) {
        Add-TestFailure "SCAN DIR MISSING: manifest scanDirs names '$dir' which does not exist"
        continue
    }
    $scanFiles += @(Get-ChildItem -Path $dirPath -Recurse -Filter '*.md' -File)
}

$scanned = 0
$rubricSpaces = @(
    @{ Prefix = 'H'; Map = $hard; Max = $hardMax },
    @{ Prefix = 'S'; Map = $soft; Max = $softMax },
    @{ Prefix = 'L'; Map = $logical; Max = $logicalMax }
)
foreach ($file in $scanFiles) {
    $scanned++
    $text = [System.IO.File]::ReadAllText($file.FullName)
    foreach ($space in $rubricSpaces) {
        foreach ($m in [regex]::Matches($text, "(?<![A-Za-z0-9])$($space.Prefix)(\d+)(?![0-9])")) {
            $cited = [int]$m.Groups[1].Value
            if ($cited -le 0) { continue }
            $rel = $file.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
            if ($cited -gt $space.Max) {
                Add-TestFailure "OUT OF RANGE CITATION: $rel cites $($space.Prefix)$cited beyond the declared max $($space.Max)"
                continue
            }
            if (-not $space.Map.ContainsKey($cited)) {
                Add-TestFailure "UNDEFINED CITATION: $rel cites $($space.Prefix)$cited, which 04-rubrics.md does not define"
            }
        }
    }
}

Write-Host "  scanned $scanned markdown files under prompt-system\ + manifest scanDirs (H/S/L citation check)"

# 3. Semantic keyword check for .opencode/**/*.ts plugin files.
#    When a .ts file cites an H id, the surrounding comment or string must
#    contain at least one keyword from the H id's title. This catches
#    copy-pasted or misapplied rubric citations in plugin code. Citing an
#    unregistered or out-of-range id fails uniformly here too.
$opencodeRoot = Join-Path $repoRoot '.opencode'
if (Test-Path -LiteralPath $opencodeRoot -PathType Container) {
    $tsFiles = Get-ChildItem -Path $opencodeRoot -Recurse -Filter '*.ts' -File | Where-Object {
        $_.FullName -notmatch '\\node_modules\\'
    }
    $tsScanned = 0
    foreach ($file in $tsFiles) {
        $tsScanned++
        $text = [System.IO.File]::ReadAllText($file.FullName)
        foreach ($m in [regex]::Matches($text, '(?<![A-Za-z0-9])H(\d+)(?![0-9])')) {
            $cited = [int]$m.Groups[1].Value
            if ($cited -le 0) { continue }
            $rel = $file.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
            if ($cited -gt $hardMax) {
                Add-TestFailure "OUT OF RANGE CITATION: $rel cites H$cited beyond the declared max $hardMax"
                continue
            }
            if (-not $hard.ContainsKey($cited)) {
                Add-TestFailure "UNDEFINED CITATION: $rel cites H$cited, which 04-rubrics.md does not define"
                continue
            }
            $title = $hard[$cited]
            # Extract candidate keywords: words longer than 3 chars from the title
            $keywords = ($title -replace '[^a-zA-Z\s]', '').Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries) |
                Where-Object { $_.Length -gt 3 } |
                Select-Object -First 6
            if ($keywords.Count -eq 0) { continue }
            # Get context window around the citation (200 chars before + 200 after)
            $idx = $m.Index
            $start = [Math]::Max(0, $idx - 200)
            $len = [Math]::Min(400, $text.Length - $start)
            $context = $text.Substring($start, $len).ToLower()
            $found = $false
            foreach ($kw in $keywords) {
                $kwLower = $kw.ToLower()
                # Match the keyword itself or common singular/plural variants
                $variants = @($kwLower)
                if ($kwLower.EndsWith('s')) { $variants += $kwLower.Substring(0, $kwLower.Length - 1) }
                else { $variants += $kwLower + 's' }
                foreach ($variant in $variants) {
                    if ($context.Contains($variant)) {
                        $found = $true
                        break
                    }
                }
                if ($found) { break }
            }
            if (-not $found) {
                Add-TestFailure "SEMANTIC CITATION: $rel cites H$cited but context lacks keywords from title: $($keywords -join ', ')"
            }
        }
    }
    Write-Host "  scanned $tsScanned .ts files under .opencode\ (semantic keyword check)"
}
exit (Complete-TestRun -SuiteName 'rubric id integrity')
