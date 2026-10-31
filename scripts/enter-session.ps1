<#
.SYNOPSIS
    Create or validate a stable SESSION_ID for lock enforcement.

.DESCRIPTION
    Generates/validates/persists a session id. Supports shell-chain env usage
    so the hook can read it from inherited environment. Can be dot-sourced
    to set $env:SESSION_ID in the current shell or run as script with -PassThru.

.PARAMETER ForceNew
    Generate a new session id even if one is already set in the environment.

.PARAMETER PassThru
    Return the session id to the caller.

.PARAMETER NoExport
    Don't export to environment (only return/print).

.EXAMPLE
    . ./scripts/enter-session.ps1
.EXAMPLE
    pwsh -NoProfile -File scripts/enter-session.ps1 -PassThru
.EXAMPLE
    $env:SESSION_ID = (pwsh -NoProfile -File scripts/enter-session.ps1 -PassThru)
#>
[CmdletBinding()]
param(
    [switch]$ForceNew,
    [switch]$PassThru,
    [switch]$NoExport
)

$ErrorActionPreference = 'Stop'

function New-SessionId {
    return "session-$(Get-Date -Format 'yyyyMMddTHHmmss')-$PID-$((Get-Random -Minimum 1000 -Maximum 9999))"
}

function Test-SessionId {
    param([string]$Id)
    if ([string]::IsNullOrWhiteSpace($Id)) { return $false }
    # Accept the format we generate
    if ($Id -match '^session-\d{8}T\d{6}-\d+-\d{4}$') { return $true }
    # Also accept longer/more general format for compatibility
    if ($Id -match '^session-[a-zA-Z0-9\-]+$') { return $true }
    return $false
}

$sessionId = $null

if (-not $ForceNew -and $env:SESSION_ID) {
    if (Test-SessionId $env:SESSION_ID) {
        $sessionId = $env:SESSION_ID
    }
}

if (-not $sessionId) {
    $sessionId = New-SessionId
}

if (-not $NoExport) {
    $env:SESSION_ID = $sessionId
}

if ($PassThru) {
    Write-Output $sessionId
} else {
    Write-Host $sessionId
}

exit 0
