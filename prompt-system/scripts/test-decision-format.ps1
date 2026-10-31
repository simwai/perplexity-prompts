# test-decision-format.ps1
# Asserts that the # Decision Needed rendering has exactly one canonical form
# corpus-wide and that the REVIEW confirmation reply vocabulary is defined in
# the format's definition file (02-decision-prompts.md).
#
# The audit found four coexisting renderings of "recommended option A"
# (**A. option text** / **A. option** / **A.** / **A**.) with S20 checking a
# string the mandatory rule did not prescribe. The canonical literal lives in
# system-manifest.json; variant literals are forbidden outside the manifest's
# baseline allowlist, which decays to empty when the definition file is aligned.
#
# Exit 0 on pass, non-zero on fail.

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\test-assertions.ps1"

$systemRoot = Join-Path $PSScriptRoot '..'
$repoRoot = (Resolve-Path (Join-Path $systemRoot '..')).Path

$manifestPath = Join-Path $systemRoot 'system-manifest.json'
Assert-FileExists -Path $manifestPath -Description 'system manifest (system-manifest.json)'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

$df = $manifest.decisionFormat
$canonical = $df.recommendedOptionLiteral

# 1. Canonical literal must be present in the definition file once aligned.
if ($df.definitionAligned) {
    Assert-FileContains -Path (Join-Path $repoRoot ($df.definitionFile -replace '/', '\')) `
        -Pattern $canonical `
        -Description "canonical rendering literal '$canonical' in the definition file"
}

# 2. Variant literals are forbidden outside the baseline allowlist.
$allow = @()
if ($df.renderingVariantsAllowlist) { $allow = @($df.renderingVariantsAllowlist) }

$scanFiles = @(Get-ChildItem -Path $systemRoot -Recurse -Filter '*.md' -File)
$agentsPath = Join-Path $repoRoot 'AGENTS.md'
if (Test-Path -LiteralPath $agentsPath -PathType Leaf) { $scanFiles += Get-Item $agentsPath }

$variantHits = 0
$defRel = $df.definitionFile
foreach ($file in $scanFiles) {
    $rel = $file.FullName.Substring($repoRoot.Length).TrimStart('\', '/') -replace '\\', '/'
    if ($rel -eq $defRel) { continue }
    $text = [System.IO.File]::ReadAllText($file.FullName)
    foreach ($variant in @($df.renderingVariantLiterals)) {
        if (-not $text.Contains($variant)) { continue }
        $variantHits++
        if ($allow -notcontains $rel) {
            Add-TestFailure "RENDERING VARIANT: $rel contains '$variant' (canonical: '$canonical')"
        }
    }
}

# 3. REVIEW confirmation reply vocabulary must be defined in the definition
#    file once declared. 'A'/'B'/'C' appear as option letters everywhere, so
#    only the non-letter verbs (skip/accept) are meaningfully checkable.
if ($df.reviewVocabularyDefined) {
    $defPath = Join-Path $repoRoot ($df.definitionFile -replace '/', '\')
    $defText = if (Test-Path -LiteralPath $defPath -PathType Leaf) { [System.IO.File]::ReadAllText($defPath) } else { '' }
    foreach ($verb in @($df.reviewReplyVerbs)) {
        if ($verb -in @('A', 'B', 'C')) { continue }
        if (-not $defText.Contains($verb)) {
            Add-TestFailure "MISSING REPLY VERB: '$verb' is a declared REVIEW reply verb but is not defined in $($df.definitionFile)"
        }
    }
}

Write-Host "  canonical: '$canonical' | variant occurrences: $variantHits (allowlisted files: $($allow.Count)) | definitionAligned: $($df.definitionAligned) | reviewVocabularyDefined: $($df.reviewVocabularyDefined)"
exit (Complete-TestRun -SuiteName 'decision format integrity')
