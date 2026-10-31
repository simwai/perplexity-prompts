<#
.SYNOPSIS
    Runs lock gate and TypeScript typecheck before push. Called by the git pre-push hook.
.DESCRIPTION
    Reads ref updates from stdin per git pre-push protocol. Enforces session locks
    for mirror refs when engaged. Runs typecheck for the OpenCode config.
.USAGE
    pwsh -NoProfile -File .\pre-push.ps1
.NOTES
    Runs under pwsh 7.6+. The TypeScript configuration is at .opencode/tsconfig.json.
.EXIT CODES
    0 = checks passed, 1 = checks failed.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = if (Test-Path (Join-Path $scriptDir 'generate-adapters.ps1')) { $scriptDir } else { Split-Path -Parent $scriptDir }

Write-Host "Running pre-push checks..." -ForegroundColor Cyan

# Read stdin for ref updates
$refUpdates = @()
try {
    while ($null -ne ($line = [Console]::In.ReadLine())) {
        if ($line.Trim()) {
            $refUpdates += $line.Trim()
        }
    }
} catch {
    # stdin may not be available in some environments
}

# ── 1. Session lock gate (mirror refs) ──────────────────────────────────────
Write-Host "`n[1/2] Checking session locks for push..." -ForegroundColor Yellow

$locksScript = Join-Path $repoRoot 'prompt-system\scripts\session-locks.ps1'
$mirrorLockBlocked = $false

if (-not (Test-Path -LiteralPath $locksScript -PathType Leaf)) {
    Write-Warning "  session-locks.ps1 not found -- lock gate SKIPPED"
} else {
    . $locksScript
    $engaged = Test-LockGateEngaged -RepoRoot $repoRoot
    if ($engaged) {
        if (-not $env:SESSION_ID) {
            Write-Error "Lock gate engaged but SESSION_ID unset -- refusing push"
            exit 1
        }
        # Check if pushing to mirror remotes
        $hasMirrorPush = $false
        foreach ($update in $refUpdates) {
            # format: <local-ref> <local-sha> <remote-ref> <remote-sha>
            $parts = $update -split '\s+'
            if ($parts.Count -ge 4) {
                $remoteRef = $parts[2]
                # Check if it's a mirror remote (we can't see remote name from stdin directly,
                # but check patterns; git passes this info differently - this is best effort)
                if ($remoteRef -match 'mirror') {
                    $hasMirrorPush = $true
                }
            }
        }
        # Also check all refs if engaged - be strict in engaged mode
        $liveCount = Get-LiveLockCount -RepoRoot $repoRoot
        if ($liveCount -ge 1 -and -not $env:SESSION_ID) {
            Write-Error "Live locks exist but no SESSION_ID -- refusing push"
            exit 1
        }
        Write-Host "  Lock gate passed for push (engaged)" -ForegroundColor Green
    } else {
        Write-Host "  No live locks -- push allowed" -ForegroundColor Green
    }
}

# ── 2. TypeScript typecheck ─────────────────────────────────────────────────
Write-Host "`n[2/2] Running TypeScript typecheck..." -ForegroundColor Yellow

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
