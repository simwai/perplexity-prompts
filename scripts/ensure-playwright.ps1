# bootstrap for Playwright MCP server and browser binaries.
# Exit codes: 0 = ready, 1 = missing Node, 2 = install failed.

$ErrorActionPreference = 'Stop'

# Node >= 20 check (stack policy)
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "ERROR: Node.js not found. Node 20+ is required." -ForegroundColor Red
    exit 1
}
$ver = [version]$nodeVersion.TrimStart('v')
if ($ver.Major -lt 20) {
    Write-Host "ERROR: Node $ver detected. Node 20+ is required." -ForegroundColor Red
    exit 1
}
Write-Host "Node $ver -- OK" -ForegroundColor Green

# @playwright/mcp availability check
try {
    $mcpVer = npx @playwright/mcp --version 2>&1
    Write-Host "Playwright MCP $mcpVer -- OK" -ForegroundColor Green
} catch {
    Write-Host "@playwright/mcp not found. Installing globally..." -ForegroundColor Yellow
    try {
        npm install -g @playwright/mcp@0.0.80 2>&1
        $mcpVer = npx @playwright/mcp --version 2>&1
        Write-Host "Playwright MCP $mcpVer installed -- OK" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Failed to install @playwright/mcp" -ForegroundColor Red
        exit 2
    }
}

# Browser binaries check
$browsersPath = Join-Path $env:LOCALAPPDATA "ms-playwright"
$chromiumInstalled = Test-Path (Join-Path $browsersPath "chromium-*")
if (-not $chromiumInstalled) {
    Write-Host "Browser binaries missing. Installing chromium..." -ForegroundColor Yellow
    try {
        npx playwright install chromium 2>&1
        Write-Host "Chromium installed -- OK" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Failed to install browser binaries" -ForegroundColor Red
        exit 2
    }
} else {
    Write-Host "Browser binaries present -- OK" -ForegroundColor Green
}

Write-Host "Playwright MCP is ready." -ForegroundColor Green
exit 0
