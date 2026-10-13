<#
.SYNOPSIS
    Validates every Mermaid block in the given Markdown files.
.DESCRIPTION
    A Mermaid block that fails to parse renders as a syntax-error box on GitHub.
    Nothing else in this repository catches that: markdownlint checks Markdown,
    not diagram grammar, and the cross-reference suite checks citations, not
    diagram bodies. This suite closes that gap.

    Each file is handed to mermaid-cli's Markdown mode, which extracts and
    renders every ```mermaid block in one browser session. Files with no Mermaid
    block are skipped without starting a browser, so the common commit is free.

    Run under pwsh 7.6+. The renderer needs Node 20+ and a Chromium download; run
    scripts/ensure-playwright.ps1 first if Chromium is missing.
.USAGE
    pwsh -NoProfile -File .\scripts\test-mermaid.ps1
    pwsh -NoProfile -File .\scripts\test-mermaid.ps1 -Path README.md,user-guide\PHASES.md
.EXAMPLE
    # Validate only staged Markdown, the way the commit gate does
    pwsh -NoProfile -File .\scripts\test-mermaid.ps1 -StagedOnly
.EXIT CODES
    0 = every diagram parses, 1 = at least one diagram failed.
#>

[CmdletBinding()]
param(
    [string[]]$Path,
    [switch]$StagedOnly
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $repoRoot 'scripts\test-mermaid.mjs'

if (-not $Path) {
    $files = if ($StagedOnly) {
        @(& git -C $repoRoot diff --cached --name-only --diff-filter=ACM -- '*.md' 2>$null)
    } else {
        @(& git -C $repoRoot ls-files -- '*.md' 2>$null)
    }
} else {
    $files = $Path
}

if (-not $files) {
    Write-Host '  no Markdown files in scope -- mermaid check SKIPPED' -ForegroundColor Gray
    exit 0
}

# Fast path: only files that actually contain a Mermaid fence can fail, and
# touching them costs a browser start. Files with no mermaid content never do.
$withMermaid = @()
foreach ($rel in $files) {
    $abs = Join-Path $repoRoot ($rel -replace '/', '\')
    if (-not (Test-Path -LiteralPath $abs -PathType Leaf)) { continue }
    if (-not (Select-String -LiteralPath $abs -SimpleMatch '```mermaid' -Quiet)) { continue }
    $withMermaid += $rel
}

if ($withMermaid.Count -eq 0) {
    Write-Host "  $($files.Count) Markdown file(s) in scope, none contain a Mermaid block -- SKIPPED" -ForegroundColor Gray
    exit 0
}

Write-Host "  validating $($withMermaid.Count) file(s) containing Mermaid blocks..." -ForegroundColor Gray

Push-Location $repoRoot
try {
    & node $runner @withMermaid
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($code -ne 0) {
    Write-Error 'Mermaid syntax validation failed -- fix the diagram before committing.'
    exit 1
}

Write-Host '  Mermaid syntax valid' -ForegroundColor Green
exit 0
