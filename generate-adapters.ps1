<#
.SYNOPSIS
    Single-source adapter generator for the Baba prompt system.
.DESCRIPTION
    This script previously generated platform-specific adapter files
    from opencode sources. All non-OpenCode adapter generation has been
    removed. The script now exists as a no-op placeholder so existing
    tooling that calls it does not break.
.EXAMPLE
    .\generate-adapters.ps1
#>

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "OK  generate-adapters.ps1 (no-op - adapters removed)" -ForegroundColor Green
