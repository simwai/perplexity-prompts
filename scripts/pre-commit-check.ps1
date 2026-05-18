#Requires -Version 5.1
# pre-commit-check.ps1
# Analyzes the repo for scripts and runs format, test, and quality checks.
# Works on Windows (PowerShell 5.1+) and cross-platform (pwsh).
# Run directly or via .pre-commit-config.yaml with pwsh.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root   = (git rev-parse --show-toplevel).Trim()
$Errors = 0
$Self   = $MyInvocation.MyCommand.Path

function Log  { param($Msg) Write-Host "[pre-commit] $Msg" }
function Pass { param($Msg) Write-Host "[pre-commit] PASS: $Msg" -ForegroundColor Green }
function Fail { param($Msg) Write-Host "[pre-commit] FAIL: $Msg" -ForegroundColor Red; $script:Errors++ }

# ── 1. Detect package manager ────────────────────────────────────────────────
Log "Detecting package manager..."
$PkgManager = $null
if     (Test-Path "$Root/package.json") {
  if   ((Get-Command pnpm -ErrorAction SilentlyContinue) -and (Test-Path "$Root/pnpm-lock.yaml")) { $PkgManager = 'pnpm' }
  elseif ((Get-Command yarn -ErrorAction SilentlyContinue) -and (Test-Path "$Root/yarn.lock"))   { $PkgManager = 'yarn' }
  elseif (Get-Command npm  -ErrorAction SilentlyContinue)                                         { $PkgManager = 'npm'  }
} elseif (Test-Path "$Root/pyproject.toml" -Or (Test-Path "$Root/setup.py")) {
  $PkgManager = 'python'
}

if (-not $PkgManager) {
  Log "No recognisable package manager found — skipping package script checks."
} else {
  Log "Package manager: $PkgManager"
}

# ── 2. Run package.json scripts: format, lint, typecheck, test, build ────────
function Invoke-NpmScript {
  param([string]$Script)
  if (-not $PkgManager -or -not (Test-Path "$Root/package.json")) { return }
  $pkg = Get-Content "$Root/package.json" | ConvertFrom-Json
  if ($pkg.scripts -and $pkg.scripts.$Script) {
    Log "Running: $PkgManager run $Script"
    Push-Location $Root
    try {
      & $PkgManager run $Script
      if ($LASTEXITCODE -eq 0) { Pass $Script } else { Fail "$Script failed" }
    } catch { Fail "$Script threw: $_" }
    finally { Pop-Location }
  } else {
    Log "Script '$Script' not found in package.json — skipping."
  }
}

foreach ($Script in @('format','lint','typecheck','test','build')) {
  Invoke-NpmScript $Script
}

# ── 3. Python checks ─────────────────────────────────────────────────────────
if ($PkgManager -eq 'python') {
  $Venv   = "$Root/.venv"
  $IsWin  = $IsWindows -or ($PSVersionTable.PSEdition -eq 'Desktop')
  $BinDir = if ($IsWin) { "$Venv/Scripts" } else { "$Venv/bin" }

  foreach ($Tool in @('ruff','mypy','pytest')) {
    $ToolBin = "$BinDir/$Tool"
    if (-not (Test-Path $ToolBin)) {
      $ToolBin = (Get-Command $Tool -ErrorAction SilentlyContinue)?.Source
    }
    if ($ToolBin) {
      Log "Running: $Tool"
      Push-Location $Root
      try {
        switch ($Tool) {
          'ruff'   { & $ToolBin check . }
          'mypy'   { & $ToolBin . }
          'pytest' { & $ToolBin . }
        }
        if ($LASTEXITCODE -eq 0) { Pass $Tool } else { Fail "$Tool failed" }
      } catch { Fail "$Tool threw: $_" }
      finally { Pop-Location }
    } else {
      Log "$Tool not found — skipping."
    }
  }
}

# ── 4. Run .sh scripts with pre-commit marker (via bash or wsl) ───────────────
$BashBin = (Get-Command bash -ErrorAction SilentlyContinue)?.Source
if ($BashBin) {
  Log "Scanning for .sh scripts..."
  Get-ChildItem -Path $Root -Recurse -Filter '*.sh' |
    Where-Object { $_.FullName -notmatch 'node_modules|\.git|\.venv' } |
    ForEach-Object {
      if ($_.FullName -eq $Self) { return }
      $Head = Get-Content $_.FullName -TotalCount 5 -ErrorAction SilentlyContinue
      if ($Head -match 'pre.commit|format|lint|test|quality') {
        Log "Running shell script: $($_.Name)"
        & $BashBin $_.FullName
        if ($LASTEXITCODE -eq 0) { Pass $_.Name } else { Fail "$($_.Name) exited non-zero" }
      } else {
        Log "Skipping (no pre-commit marker): $($_.Name)"
      }
    }
} else {
  Log "bash not found — skipping .sh scripts."
}

# ── 5. Run other .ps1 scripts with pre-commit marker ─────────────────────────
Log "Scanning for .ps1 scripts..."
Get-ChildItem -Path $Root -Recurse -Filter '*.ps1' |
  Where-Object { $_.FullName -notmatch 'node_modules|\.git|\.venv' } |
  ForEach-Object {
    if ($_.FullName -eq $Self) { return }
    $Head = Get-Content $_.FullName -TotalCount 5 -ErrorAction SilentlyContinue
    if ($Head -match 'pre.commit|format|lint|test|quality') {
      Log "Running PowerShell script: $($_.Name)"
      try {
        & pwsh -NonInteractive -File $_.FullName
        if ($LASTEXITCODE -eq 0) { Pass $_.Name } else { Fail "$($_.Name) exited non-zero" }
      } catch { Fail "$($_.Name) threw: $_" }
    } else {
      Log "Skipping (no pre-commit marker): $($_.Name)"
    }
  }

# ── 6. Summary ───────────────────────────────────────────────────────────────
Write-Host ""
if ($Errors -eq 0) {
  Log "All checks passed. ✓"
  exit 0
} else {
  Write-Host "[pre-commit] $Errors check(s) failed. Commit blocked." -ForegroundColor Red
  exit 1
}
