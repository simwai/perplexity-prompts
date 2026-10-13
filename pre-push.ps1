<#
.SYNOPSIS
    Runs the TypeScript typecheck before push. Called by the git pre-push hook.
.DESCRIPTION
    Runs `tsc --noEmit` against the OpenCode configuration. This is a slow
    check (~150s) that belongs on the push gate, not the commit gate, per
    the repo's own guidance in 07-protocols.md.
.USAGE
    pwsh -NoProfile -File .\pre-push.ps1
.NOTES
    Runs under pwsh 7.6+. The TypeScript configuration is at .opencode/tsconfig.json.
.EXIT CODES
    0 = typecheck passed, 1 = typecheck failed.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = if (Test-Path (Join-Path $scriptDir 'generate-adapters.ps1')) { $scriptDir } else { Split-Path -Parent $scriptDir }

Write-Host "Running pre-push checks..." -ForegroundColor Cyan

Write-Host "`n[1/1] Running TypeScript typecheck..." -ForegroundColor Yellow

$tscOutput = & npx tsc --noEmit -p .opencode/tsconfig.json 2>&1
$tscCode = $LASTEXITCODE
if ($tscCode -ne 0) {
    $tscOutput | ForEach-Object { Write-Error "  $_" }
    Write-Error "TypeScript typecheck failed"
    exit 1
}
Write-Host "  TypeScript typecheck passed" -ForegroundColor Green

Write-Host "`nAll pre-push checks passed!" -ForegroundColor Green
exit 0
