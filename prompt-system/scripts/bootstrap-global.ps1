<#
.SYNOPSIS
    One-time bootstrap for the global opencode layer on a new system.
.DESCRIPTION
    Sets up the user-level opencode config, global plugins, and vibeguard
    config so project sync no longer needs per-project global setup.

    Idempotent: safe to run multiple times.
    Run this once after cloning/syncing the prompt-system repo.

    Steps:
      1. Ensure global opencode config exists with shared plugins
      2. Copy local adaptive-temperature.ts to the global plugins folder
      3. Install opencode-vibeguard globally via npm
      4. Write the global vibeguard.config.json
      5. Remind the user to complete Exa OAuth consent
#>
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$promptSystemRoot = Split-Path -Parent $scriptDir
$repoRoot = Split-Path -Parent $promptSystemRoot

# Resolve opencode global paths
$globalConfigDir = Join-Path $env:USERPROFILE '.config\opencode'
$globalPluginsDir = Join-Path $env:APPDATA 'opencode\plugins'
$globalVibeguardConfig = Join-Path $env:APPDATA 'opencode\vibeguard.config.json'
$globalOpencodeConfig = Join-Path $globalConfigDir 'opencode.jsonc'

# Source files from this repo
$localAdaptiveTemp = Join-Path $repoRoot '.opencode\plugins\adaptive-temperature.ts'
$localOpencodeConfig = Join-Path $repoRoot 'opencode.jsonc'

# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

function Write-Info($msg) {
    Write-Host "    $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "    OK  $msg" -ForegroundColor Green
}

function Write-Skip($msg) {
    Write-Host "    SKIP $msg" -ForegroundColor DarkGray
}

function Write-Warn($msg) {
    Write-Host "    WARN $msg" -ForegroundColor Yellow
}

# ═══════════════════════════════════════════════════════════════════════════
# 1. Global opencode config
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ''
Write-Host 'Step 1: Global opencode config' -ForegroundColor White

if (-not (Test-Path $globalConfigDir)) {
    New-Item -ItemType Directory -Path $globalConfigDir -Force | Out-Null
    Write-Info "Created $globalConfigDir"
}

$existing = $null
if (Test-Path $globalOpencodeConfig) {
    $existing = Get-Content -LiteralPath $globalOpencodeConfig -Raw -Encoding UTF8
}

$desiredPluginBlock = @'
  // Global plugins shared across all projects.
  "plugin": [
    "opencode-vibeguard@latest",
    "adaptive-temperature.ts"
  ],
'@

if ($existing -and $existing.Contains('"plugin":') -and -not $Force) {
    Write-Skip "global opencode.jsonc already has a plugin block; use -Force to overwrite"
} else {
    if (-not $existing) {
        $existing = "{`n`n"
    }
    
    # Remove any existing plugin block to avoid duplicates
    $cleaned = ($existing -split "`n" | Where-Object { $_ -notmatch '^\s*"plugin":\s*\[' }) -join "`n"
    $cleaned = ($cleaned -split "`n" | Where-Object { $_ -notmatch '^\s*// Global plugins' }) -join "`n"
    
    # Insert plugin block after $schema line
    $lines = $cleaned -split "`n"
    $newLines = @()
    $inserted = $false
    foreach ($line in $lines) {
        $newLines += $line
        if (-not $inserted -and $line -match '^\s*"\$schema"') {
            $newLines += $desiredPluginBlock
            $inserted = $true
        }
    }
    
    if (-not $inserted) {
        # No $schema found, prepend
        $newLines = @($desiredPluginBlock) + $lines
    }
    
    $final = ($newLines -join "`n").TrimEnd() + "`n"
    Set-Content -LiteralPath $globalOpencodeConfig -Value $final -Encoding UTF8 -NoNewline
    Write-Ok "Updated $globalOpencodeConfig"
}

# ═══════════════════════════════════════════════════════════════════════════
# 2. Global adaptive-temperature.ts plugin
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ''
Write-Host 'Step 2: Global adaptive-temperature.ts' -ForegroundColor White

if (-not (Test-Path $localAdaptiveTemp)) {
    Write-Warn "Source file not found at $localAdaptiveTemp; skipping copy"
} else {
    if (-not (Test-Path $globalPluginsDir)) {
        New-Item -ItemType Directory -Path $globalPluginsDir -Force | Out-Null
        Write-Info "Created $globalPluginsDir"
    }
    
    $dest = Join-Path $globalPluginsDir 'adaptive-temperature.ts'
    if ((Test-Path $dest) -and -not $Force) {
        Write-Skip "adaptive-temperature.ts already exists in global plugins; use -Force to overwrite"
    } else {
        Copy-Item -LiteralPath $localAdaptiveTemp -Destination $dest -Force
        Write-Ok "Copied adaptive-temperature.ts to $dest"
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# 3. Global opencode-vibeguard npm install
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ''
Write-Host 'Step 3: Global opencode-vibeguard npm install' -ForegroundColor White

$npmCmd = $null
try { $npmCmd = (Get-Command npm).Source } catch { $null }
if (-not $npmCmd) {
    $npmCmd = 'C:\Program Files\nodejs\npm.cmd'
}

if (-not (Test-Path $npmCmd)) {
    Write-Warn "npm not available on PATH or at default location; install opencode-vibeguard manually"
} else {
    Write-Info "Running: npm install -g opencode-vibeguard"
    $oldPwd = $pwd
    try {
        Set-Location $globalConfigDir
        $output = & $npmCmd install -g opencode-vibeguard 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "opencode-vibeguard installed globally"
        } else {
            Write-Warn "npm install -g opencode-vibeguard failed:`n$output"
        }
    } finally {
        Set-Location $oldPwd
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# 4. Global vibeguard.config.json
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ''
Write-Host 'Step 4: Global vibeguard.config.json' -ForegroundColor White

$vibeguardConfigDir = Split-Path -Parent $globalVibeguardConfig
if (-not (Test-Path $vibeguardConfigDir)) {
    New-Item -ItemType Directory -Path $vibeguardConfigDir -Force | Out-Null
    Write-Info "Created $vibeguardConfigDir"
}

if ((Test-Path $globalVibeguardConfig) -and -not $Force) {
    Write-Skip "vibeguard.config.json already exists; use -Force to overwrite"
} else {
    $vibeguardContent = @'
{
  "enabled": true,
  "debug": false,
  "placeholder_prefix": "__VG_",
  "session": {
    "ttl": "1h",
    "max_mappings": 100000
  },
  "patterns": {
    "keywords": [
      { "value": "my-api-key-123", "category": "API_KEY" },
      { "value": "sk-", "category": "OPENAI_KEY" },
      { "value": "ghp_", "category": "GITHUB_TOKEN" },
      { "value": "gho_", "category": "GITHUB_TOKEN" },
      { "value": "ghu_", "category": "GITHUB_TOKEN" },
      { "value": "ghs_", "category": "GITHUB_TOKEN" },
      { "value": "ghr_", "category": "GITHUB_TOKEN" },
      { "value": "glpat-", "category": "GITLAB_TOKEN" },
      { "value": "sb_", "category": "SUPABASE_KEY" },
      { "value": "sk-ant-", "category": "ANTHROPIC_KEY" },
      { "value": "AKIA", "category": "AWS_ACCESS_KEY" }
    ],
    "regex": [
      { "pattern": "sk-[A-Za-z0-9]{48}", "category": "OPENAI_KEY" },
      { "pattern": "(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]+", "category": "GITHUB_TOKEN" },
      { "pattern": "glpat-[A-Za-z0-9]{20,}", "category": "GITLAB_TOKEN" },
      { "pattern": "sb_[A-Za-z0-9]{40,}", "category": "SUPABASE_KEY" },
      { "pattern": "sk-ant-[A-Za-z0-9_-]{36,}", "category": "ANTHROPIC_KEY" },
      { "pattern": "AKIA[0-9A-Z]{16}", "category": "AWS_ACCESS_KEY" },
      { "pattern": "[a-zA-Z0-9_-]*secret[a-zA-Z0-9_-]*", "category": "GENERIC_SECRET" },
      { "pattern": "[a-zA-Z0-9_-]*password[a-zA-Z0-9_-]*", "category": "GENERIC_SECRET" },
      { "pattern": "[a-zA-Z0-9_-]*token[a-zA-Z0-9_-]*", "category": "GENERIC_TOKEN" },
      { "pattern": "[a-zA-Z0-9_-]*api_key[a-zA-Z0-9_-]*", "category": "GENERIC_API_KEY" },
      { "pattern": "[a-zA-Z0-9_-]*apikey[a-zA-Z0-9_-]*", "category": "GENERIC_API_KEY" },
      { "pattern": "xox[baprs]-[0-9a-zA-Z]{10,48}", "category": "SLACK_TOKEN" },
      { "pattern": "xoxe-1-[0-9a-zA-Z]{6,11}-[0-9a-zA-Z]{24,}", "category": "SLACK_TOKEN" },
      { "pattern": "[a-zA-Z0-9_-]*client_secret[a-zA-Z0-9_-]*", "category": "OAUTH_SECRET" },
      { "pattern": "[a-zA-Z0-9_-]*private_key[a-zA-Z0-9_-]*", "category": "PRIVATE_KEY" },
      { "pattern": "-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----", "category": "PRIVATE_KEY" }
    ],
    "builtin": [
      "email",
      "china_phone",
      "china_id",
      "uuid",
      "ipv4",
      "mac",
      "phone",
      "ssn",
      "credit_card",
      "iban"
    ],
    "exclude": [
      "example.com",
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "0.0.0.0",
      "::1",
      "test",
      "testing",
      "fake",
      "dummy",
      "placeholder",
      "CHANGE_ME",
      "YOUR_",
      "REPLACE_",
      "xxx",
      "XXX"
    ]
  }
}
'@
    Set-Content -LiteralPath $globalVibeguardConfig -Value $vibeguardContent -Encoding UTF8 -NoNewline
    Write-Ok "Created $globalVibeguardConfig"
}

# ═══════════════════════════════════════════════════════════════════════════
# 5. Reminders / manual steps
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ''
Write-Host 'Step 5: Manual steps required' -ForegroundColor White
Write-Host '  [ ] Run: opencode mcp auth exa' -ForegroundColor Yellow
Write-Host '        (completes one-time OAuth consent for Exa web search)' -ForegroundColor DarkGray
Write-Host ''

Write-Host 'Bootstrap complete.' -ForegroundColor Green
