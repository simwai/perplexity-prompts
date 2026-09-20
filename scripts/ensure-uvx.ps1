<#
.SYNOPSIS
    Standalone uvx bootstrap script — run MANUALLY before first use of the arXiv MCP.
.DESCRIPTION
    Checks whether uvx is available. If not, installs uv (Astral's Python/packaging
    toolchain) using the official PowerShell installer. uvx ships with uv.
    NOT invoked by sync.ps1 — this is a manual bootstrap step.
.USAGE
    .\scripts\ensure-uvx.ps1
.EXIT CODES
    0 = ready, 1 = install failed.
#>

$ErrorActionPreference = 'Stop'

# uvx availability check
$uvx = Get-Command uvx -ErrorAction SilentlyContinue
if ($uvx) {
    Write-Host "uvx found at $($uvx.Source) -- OK" -ForegroundColor Green
    exit 0
}

Write-Host "uvx not found. Installing uv..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri 'https://astral.sh/uv/install.ps1' -OutFile $env:TEMP\install-uv.ps1
    & powershell -NoProfile -ExecutionPolicy Bypass -File $env:TEMP\install-uv.ps1
    Remove-Item $env:TEMP\install-uv.ps1 -ErrorAction SilentlyContinue
} catch {
    Write-Host "ERROR: Failed to install uv" -ForegroundColor Red
    exit 1
}

$uvxAfter = Get-Command uvx -ErrorAction SilentlyContinue
if (-not $uvxAfter) {
    Write-Host "ERROR: uvx still not found after installation. Restart your shell and retry." -ForegroundColor Red
    exit 1
}

Write-Host "uvx found at $($uvxAfter.Source) -- OK" -ForegroundColor Green
exit 0
