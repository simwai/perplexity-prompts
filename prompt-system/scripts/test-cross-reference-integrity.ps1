# test-cross-reference-integrity.ps1
# Asserts that every `file.md` `## Anchor` citation inside the deployed
# prompt-system resolves to a heading that actually exists in the named file.
#
# A citation to a missing anchor is silent breakage: the agent follows the
# pointer, finds nothing, and either invents the rule or skips the protocol.
# Six such dangling citations shipped for the session-evaluation prompt alone.
#
# Scope: prompt-system\ and AGENTS.md, the surface AGENTS.md deploys.
# Exit 0 on pass, non-zero on fail.

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\test-assertions.ps1"

$systemRoot = Join-Path $PSScriptRoot '..'
$repoRoot = (Resolve-Path (Join-Path $systemRoot '..')).Path

# Structural manifest: the machine-readable registry of load-order files and
# baseline allowlists. Required since the remediation's Phase 1; the suites
# and the manifest must move together.
$manifestPath = Join-Path $systemRoot 'system-manifest.json'
Assert-FileExists -Path $manifestPath -Description 'system manifest (system-manifest.json)'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

function Get-NormalizedHeadings {
    param([string]$Path)

    $set = New-Object 'System.Collections.Generic.HashSet[string]'
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $set }
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if ($line -match '^(#{1,6})\s+(.*)$') {
            $text = $Matches[2] -replace '`', ''
            [void]$set.Add($text.Trim().ToLowerInvariant())
        }
    }
    return $set
}

# Citations routinely name a readable prefix of a longer heading
# (`## T-01` for `## T-01 -- Project style policy auto-trigger`), so a citation
# resolves on an exact match or on a word-boundary prefix of a real heading.
function Test-AnchorResolves {
    param([System.Collections.Generic.HashSet[string]]$Headings, [string]$Anchor)

    foreach ($heading in $Headings) {
        if ($heading -eq $Anchor) { return $true }
        if ($heading.StartsWith($Anchor)) {
            $next = $heading.Substring($Anchor.Length, 1)
            if ($next -match '[\s\-\(\):]') { return $true }
        }
    }
    return $false
}

function Resolve-CitedFile {
    param([string]$Cited)

    $candidates = @()
    if ($Cited -match '/') {
        $candidates += Join-Path $repoRoot ($Cited -replace '/', '\')
    } else {
        $candidates += (Join-Path $systemRoot $Cited)
        $candidates += (Join-Path $repoRoot $Cited)
    }
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c -PathType Leaf) { return $c }
    }
    return $null
}

$headingCache = @{}
$checked = 0
$citationPattern = [regex]'`([A-Za-z0-9_.\-/]+\.md)`\s+`#{2,4}\s+([^`]+)`'

$files = @(Get-ChildItem -Path $systemRoot -Recurse -Filter '*.md' -File)

# AGENTS.md ships alongside prompt-system\, but the suite must stay runnable from a
# partial copy of the tree, so treat it as optional rather than a hard dependency.
$agentsPath = Join-Path $repoRoot 'AGENTS.md'
if (Test-Path -LiteralPath $agentsPath) {
    $files += Get-Item $agentsPath
}

# Repository documentation is scanned too. It carries `file.md` + `## Anchor`
# citations that are just as load-bearing -- a reader follows the pointer, finds
# nothing, and assumes the rule does not exist. This scope used to name a `docs\`
# directory that no longer exists, which silently left user-guide\, project-management\
# and every root document unchecked; that is how
# `SYSTEM_OVERVIEW.md#handoff-contract` survived as a dangling citation in
# user-guide\PERSONAS.md.
$docScopes = @('user-guide', 'project-management')
foreach ($scopeName in $docScopes) {
    $scopeRoot = Join-Path $repoRoot $scopeName
    if (Test-Path -LiteralPath $scopeRoot -PathType Container) {
        $files += @(Get-ChildItem -Path $scopeRoot -Recurse -Filter '*.md' -File)
    }
}

# Root-level documentation, excluding the generated CHANGELOG_ARCHIVE.md: it is a
# frozen historical record whose prose names files and anchors that have since
# moved, and rewriting history is not this suite's job.
Get-ChildItem -Path $repoRoot -Filter '*.md' -File |
    Where-Object { $_.Name -ne 'CHANGELOG_ARCHIVE.md' } |
    ForEach-Object { $files += $_ }

# Host adapter surfaces are scanned too. Skills, commands, and agent files
# under .kilo\, .opencode\, .claude\, and the adapter templates that generate
# them (adapters\) carry the same load-bearing `file.md` `## Anchor` citations
# -- these are the pointers the agent follows at runtime. The discuss skill
# cited `00-system.md` `## Discuss mode`, which lives in 07-protocols.md, and
# the suites above could not see it because none of these directories were in
# scope. Optional-if-exists per directory: a deployed target may ship none of
# them, and the suite must stay runnable from a partial tree (same contract as
# AGENTS.md above).
$hostScopes = @('.kilo', '.opencode', '.claude', 'adapters')
$hostScopeCounts = @{}
foreach ($scopeName in $hostScopes) {
    $scopeRoot = Join-Path $repoRoot $scopeName
    if (-not (Test-Path -LiteralPath $scopeRoot -PathType Container)) { continue }
    $scopeFiles = @(Get-ChildItem -Path $scopeRoot -Recurse -Filter '*.md' -File)
    # Two filters, both against the scope-relative path (never the absolute
    # FullName: an ancestor directory named "plans" must not silently exclude
    # a whole scope) and both separator-agnostic (so they still match when
    # pwsh/Linux FullNames use '/').
    # Vendored and generated subtrees: .gitignore:26 declares node_modules/
    # and .opencode\ ships a full dependency tree. Unfiltered, the sweep read
    # ~1100 files outside the repo's control, the suite's verdict depended on
    # the machine (clean clone vs installed tree), and one vendored README
    # citation could fail the commit gate on third-party content
    # (07-protocols.md ## Artifact handling).
    # Frozen-history stores (plans\ subdirectories): the same carve-out
    # CHANGELOG_ARCHIVE.md gets -- plan documents cite files and anchors that
    # have since moved, and rewriting history is not this suite's job.
    # .kilo\plans\1793105664727-command-skill-rationalization.md:38 carries a
    # known stale `## Session State` citation; .opencode\plans\ holds the same
    # class, so the exclusion is symmetric across scopes.
    $scopeFiles = @($scopeFiles | Where-Object {
        $rel = $_.FullName.Substring($scopeRoot.Length).TrimStart('\', '/')
        $rel -notmatch '(^|[\\/])(node_modules|\.cache|dist|build)([\\/]|$)' -and $rel -notmatch '(^|[\\/])plans([\\/]|$)'
    })
    $files += $scopeFiles
    $hostScopeCounts[$scopeName] = $scopeFiles.Count
    # A present scope that contributes nothing means the mechanism that covers
    # this surface is broken (a deleted append, a renamed directory) -- the
    # same silent-hole class the file's own comment describes at the docs\
    # incident above. An ABSENT scope stays a silent skip; only present-but-
    # empty fails.
    if ($scopeFiles.Count -eq 0) {
        Add-TestFailure "SCOPE EMPTY: host scope '$scopeName' exists but contributed no markdown files after exclusions -- the scan mechanism covering this surface is broken"
    }
}

# ── Load-order existence ────────────────────────────────────────────────────
# Every file the manifest's load order names must exist. The citation checks
# below only see files somebody cites; a renamed load-order file that nothing
# cites (AGENTS.md, 04b, 09, 10, the stacks) would otherwise pass silently.
$tierFiles = @()
$tierFiles += @($manifest.loadOrder.always)
$tierFiles += @($manifest.loadOrder.reviewPatch)
$tierFiles += @($manifest.loadOrder.conditional)
foreach ($rel in $tierFiles) {
    $p = Join-Path $repoRoot ($rel -replace '/', '\')
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) {
        Add-TestFailure "LOAD ORDER MISSING: manifest lists '$rel' but the file does not exist"
    }
}

foreach ($file in $files) {
    $rel = $file.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
    $text = [System.IO.File]::ReadAllText($file.FullName)

    foreach ($m in $citationPattern.Matches($text)) {
        $citedFile = $m.Groups[1].Value
        $anchor = ($m.Groups[2].Value -replace '`', '').Trim().ToLowerInvariant()
        $checked++

        $resolved = Resolve-CitedFile -Cited $citedFile
        if (-not $resolved) {
            Add-TestFailure "UNRESOLVED FILE: $rel cites ``$citedFile`` which exists in neither prompt-system\ nor the repo root"
            continue
        }

        if (-not $headingCache.ContainsKey($resolved)) {
            $headingCache[$resolved] = Get-NormalizedHeadings -Path $resolved
        }
        if (-not (Test-AnchorResolves -Headings $headingCache[$resolved] -Anchor $anchor)) {
            $targetRel = $resolved.Substring($repoRoot.Length).TrimStart('\', '/')
            Add-TestFailure "DANGLING ANCHOR: $rel cites ``$citedFile`` ``$anchor`` but $targetRel has no such heading"
        }
    }
}

# ── Bare-anchor audit (blocking) ────────────────────────────────────────────
# A backticked `## Anchor` with no preceding `file.md` is ambiguous: it may mean
# this file, another system file, or a session-context field (`## Edited Files`,
# `## Plan Approval`) that is not a heading anywhere. The audit gates: an orphan
# that is neither a real heading anywhere in the corpus nor an allowlisted
# session-state field name is a phantom pointer, and a phantom pointer is
# exactly the silent breakage this suite exists to catch -- `## Loop protection`
# was cited four times, resolved nowhere, while the paired-citation pass above
# could not see it (two of those citations are self-references with no `file.md`
# token to pair). Session-state field names live in system-manifest.json
# bareAnchorAllowlist so the gate stays actionable on system content only.
$barePattern = [regex]'`#{2,4}\s+([^`]+)`'
$allHeadings = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($file in $files) {
    if (-not $headingCache.ContainsKey($file.FullName)) {
        $headingCache[$file.FullName] = Get-NormalizedHeadings -Path $file.FullName
    }
    foreach ($h in $headingCache[$file.FullName]) { [void]$allHeadings.Add($h) }
}

$bareAllow = @()
if ($manifest.bareAnchorAllowlist) { $bareAllow = @($manifest.bareAnchorAllowlist) }

$orphans = New-Object System.Collections.Generic.List[string]
$allowedOrphans = 0
foreach ($file in $files) {
    $text = [System.IO.File]::ReadAllText($file.FullName)
    $own = $headingCache[$file.FullName]
    foreach ($m in $barePattern.Matches($text)) {
        $anchor = ($m.Groups[1].Value -replace '`', '').Trim().ToLowerInvariant()
        if (Test-AnchorResolves -Headings $own -Anchor $anchor) { continue }
        if (Test-AnchorResolves -Headings $allHeadings -Anchor $anchor) { continue }
        if ($bareAllow -contains $anchor) { $allowedOrphans++; continue }
        $orphans.Add("$($file.Name) -> ``$anchor``")
    }
}

if ($orphans.Count -gt 0) {
    Write-Warning "  $($orphans.Count) bare ``## anchor`` citations resolve to no heading in any scanned file and are not allowlisted:"
    $orphans | Sort-Object -Unique | ForEach-Object { Write-Warning "    $_" }
    foreach ($o in ($orphans | Sort-Object -Unique)) {
        Add-TestFailure "PHANTOM ANCHOR: $o -- add a real heading, fix the citation, or (session-context fields only) extend bareAnchorAllowlist in system-manifest.json"
    }
}

$hostScopeSummary = ($hostScopeCounts.Keys | Sort-Object | ForEach-Object { "$($_): $($hostScopeCounts[$_])" }) -join ' | '
Write-Host "  checked $checked file+anchor citations across $($files.Count) files (host scopes: $hostScopeSummary; $($orphans.Count) phantom, $allowedOrphans allowlisted bare-anchor orphans)"
exit (Complete-TestRun -SuiteName 'cross-reference integrity')
