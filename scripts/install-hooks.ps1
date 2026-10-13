<#
.SYNOPSIS
    Installs the repository's pre-commit and pre-push hooks. Run once after cloning.
.DESCRIPTION
    The documentation and integrity gates live in pre-commit.ps1 and pre-push.ps1
    and are only enforced if the git hooks that call them exist. .git\hooks\ is
    not tracked by git, so a fresh clone has no hooks and every gate silently
    does nothing.

    This script writes the shims into .git\hooks\pre-commit and
    .git\hooks\pre-push and makes them executable. It refuses to overwrite an
    existing hook that it did not write, so a customised hook is never silently
    replaced.
.USAGE
    pwsh -NoProfile -File .\scripts\install-hooks.ps1
    pwsh -NoProfile -File .\scripts\install-hooks.ps1 -Uninstall
.NOTES
    Both hooks must run under pwsh 7.6+. Running generate-adapters.ps1 under
    Windows PowerShell 5.1 writes a UTF-8 BOM and the regeneration check
    reports spurious changes.
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
$preCommitPath = Join-Path $hooksDir 'pre-commit'
$prePushPath = Join-Path $hooksDir 'pre-push'

$preCommitShim = @'
#!/bin/sh
# Self-contained pre-commit hook for Baba prompt system
# Calls the project's pre-commit.ps1 script
# Installed by scripts/install-hooks.ps1 -- see that script before editing.

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
exec pwsh -NoProfile -ExecutionPolicy Bypass -File "$REPO_ROOT/pre-commit.ps1"
'@

$prePushShim = @'
#!/bin/sh
# Self-contained pre-push hook for Baba prompt system
# Calls the project's pre-push.ps1 script
# Installed by scripts/install-hooks.ps1 -- see that script before editing.

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
exec pwsh -NoProfile -ExecutionPolicy Bypass -File "$REPO_ROOT/pre-push.ps1"
'@

if ($Uninstall) {
    $removed = $false
    if (Test-Path -LiteralPath $preCommitPath) {
        Remove-Item -LiteralPath $preCommitPath -Force
        Write-Host 'pre-commit hook removed' -ForegroundColor Yellow
        $removed = $true
    }
    if (Test-Path -LiteralPath $prePushPath) {
        Remove-Item -LiteralPath $prePushPath -Force
        Write-Host 'pre-push hook removed' -ForegroundColor Yellow
        $removed = $true
    }
    if (-not $removed) {
        Write-Host 'no hooks present' -ForegroundColor Gray
    }
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

function Install-Hook {
    param([string]$HookPath, [string]$Shim, [string]$Name)

    if (Test-Path -LiteralPath $HookPath -PathType Leaf) {
        $existing = Get-Content -LiteralPath $HookPath -Raw
        # The invariant is "this hook delegates to our gate", not "this hook
        # carries our marker comment". Clones predating this script already
        # delegate to pre-commit.ps1 or pre-push.ps1, and refusing those would
        # make the installer unusable for exactly the people who need it.
        if ($existing -match 'pre-commit\.ps1|pre-push\.ps1') {
            Write-Host "$Name hook already delegates to the gate -- OK" -ForegroundColor Green
            return $true
        }
        Write-Host "ERROR: an unmanaged $Name hook is already present." -ForegroundColor Red
        Write-Host "       Inspect it, then re-run with -Uninstall if you want this script to own the hook." -ForegroundColor Red
        return $false
    }

    [System.IO.File]::WriteAllText($HookPath, $Shim, (New-Object System.Text.UTF8Encoding($false)))
    & git -C $repoRoot update-index --chmod=+x -- .git/hooks/pre-commit 2>$null | Out-Null
    & git -C $repoRoot update-index --chmod=+x -- .git/hooks/pre-push 2>$null | Out-Null
    Write-Host "$Name hook installed" -ForegroundColor Green
    return $true
}

$ok = $true
$ok = (Install-Hook -HookPath $preCommitPath -Shim $preCommitShim -Name 'pre-commit') -and $ok
$ok = (Install-Hook -HookPath $prePushPath -Shim $prePushShim -Name 'pre-push') -and $ok

if ($ok) {
    Write-Host 'Both hooks installed. Gates now active on commit and push.' -ForegroundColor Green
} else {
    Write-Host 'Some hooks failed to install.' -ForegroundColor Red
    exit 1
}
exit 0
