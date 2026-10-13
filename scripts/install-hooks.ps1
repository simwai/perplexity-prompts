<#
.SYNOPSIS
    Installs the repository's pre-commit hook. Run once after cloning.
.DESCRIPTION
    The documentation and integrity gates live in pre-commit.ps1 and are only
    enforced if the git hook that calls it exists. .git\hooks\ is not tracked by
    git, so a fresh clone has no hook and every gate silently does nothing.

    This script writes the shim into .git\hooks\pre-commit and makes it
    executable. It refuses to overwrite an existing hook that it did not write,
    so a customised hook is never silently replaced.
.USAGE
    pwsh -NoProfile -File .\scripts\install-hooks.ps1
    pwsh -NoProfile -File .\scripts\install-hooks.ps1 -Uninstall
.NOTES
    The hook must run under pwsh 7.6+. Running generate-adapters.ps1 under
    Windows PowerShell 5.1 writes a UTF-8 BOM and the regeneration check reports
    spurious changes.
.EXIT CODES
    0 = installed or already present, 1 = refused or failed.
#>

[CmdletBinding()]
param(
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$hooksDir = Join-Path $repoRoot '.git\hooks'
$hookPath = Join-Path $hooksDir 'pre-commit'

$shim = @'
#!/bin/sh
# Self-contained pre-commit hook for Baba prompt system
# Calls the project's pre-commit.ps1 script
# Installed by scripts/install-hooks.ps1 -- see that script before editing.

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
exec pwsh -NoProfile -ExecutionPolicy Bypass -File "$REPO_ROOT/pre-commit.ps1"
'@

if ($Uninstall) {
    if (Test-Path -LiteralPath $hookPath) {
        Remove-Item -LiteralPath $hookPath -Force
        Write-Host 'pre-commit hook removed' -ForegroundColor Yellow
        exit 0
    }
    Write-Host 'no pre-commit hook present' -ForegroundColor Gray
    exit 0
}

$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
if (-not $pwsh) {
    Write-Host 'ERROR: pwsh not found. PowerShell 7.6+ is required (see README Prerequisites).' -ForegroundColor Red
    exit 1
}
$version = (& pwsh -NoProfile -Command '$PSVersionTable.PSVersion.Major') -as [int]
if ($version -lt 7) {
    Write-Host "ERROR: pwsh $($pwsh.Source) reports major version $version; 7 or higher is required." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath $hooksDir -PathType Container)) {
    Write-Host "ERROR: $hooksDir not found. Is this a git repository?" -ForegroundColor Red
    exit 1
}

if (Test-Path -LiteralPath $hookPath -PathType Leaf) {
    $existing = Get-Content -LiteralPath $hookPath -Raw
    # The invariant is "this hook delegates to our gate", not "this hook carries
    # our marker comment". Clones predating this script already delegate to
    # pre-commit.ps1, and refusing those would make the installer unusable for
    # exactly the people who need it.
    if ($existing -match 'pre-commit\.ps1') {
        Write-Host 'pre-commit hook already delegates to pre-commit.ps1 -- OK' -ForegroundColor Green
        exit 0
    }
    Write-Host 'ERROR: a pre-commit hook that does not call pre-commit.ps1 is already present.' -ForegroundColor Red
    Write-Host '       Inspect it, then re-run with -Uninstall if you want this script to own the hook.' -ForegroundColor Red
    exit 1
}

[System.IO.File]::WriteAllText($hookPath, $shim, (New-Object System.Text.UTF8Encoding($false)))
& git -C $repoRoot update-index --chmod=+x -- .git/hooks/pre-commit 2>$null | Out-Null

Write-Host "pre-commit hook installed at $hookPath" -ForegroundColor Green
Write-Host 'Gates now active: TOC generation, Markdown lint, adapter regeneration,' -ForegroundColor Gray
Write-Host 'TypeScript typecheck, prompt-system integrity suites, secret scan.' -ForegroundColor Gray
exit 0
