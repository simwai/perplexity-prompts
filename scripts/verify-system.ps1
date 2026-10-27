<#
.SYNOPSIS
    Verifies the deployed prompt-system is intact and internally consistent.

.DESCRIPTION
    Single entry point for "is the system diagnosable / intact?" Checks:

      1. AGENTS.md exists at repo root and is non-empty.
      2. prompt-system/00-system.md exists and is readable.
      3. Every file named in the 00-system.md load order exists on disk.
      4. The four integrity suites pass:
         - test-rubric-id-integrity.ps1
         - test-cross-reference-integrity.ps1
         - test-self-review-protocol.ps1
         - test-session-locks.ps1
      5. Markdown lint passes on AGENTS.md and every prompt-system/*.md (when
         npx + .markdownlint.jsonc are available).
      6. The pre-commit gate scripts exist (pre-commit.ps1, pre-push.ps1).

    Exit code 0 = all checks passed; 1 = one or more failures.

.EXAMPLE
    pwsh -File scripts/verify-system.ps1
    pwsh -File scripts/verify-system.ps1 -SkipLint
#>

[CmdletBinding()]
param(
    [switch]$SkipLint
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent $PSScriptRoot
$failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure {
    param([string]$Message)
    $failures.Add($Message)
    Write-Host "  FAIL  $Message" -ForegroundColor Red
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "== $Title" -ForegroundColor Cyan
}

function Test-FilePresent {
    param([string]$RelPath, [string]$Label)
    $full = Join-Path $repoRoot $RelPath
    if (-not (Test-Path -LiteralPath $full)) {
        Add-Failure "$Label missing: $RelPath"
        return $false
    }
    if ((Get-Item -LiteralPath $full).Length -eq 0) {
        Add-Failure "$Label is empty: $RelPath"
        return $false
    }
    Write-Host "  ok    $RelPath" -ForegroundColor Green
    return $true
}

# ---------------------------------------------------------------------------
Write-Section "1. Entry point and orchestrator"

Test-FilePresent -RelPath "AGENTS.md" -Label "AGENTS.md" | Out-Null
Test-FilePresent -RelPath "prompt-system\00-system.md" -Label "orchestrator" | Out-Null

# ---------------------------------------------------------------------------
Write-Section "2. Load-order files present"

$loadOrder = @(
    "AGENTS.md",
    "prompt-system\00-system.md",
    "prompt-system\11-triggers.md",
    "prompt-system\01-personas.md",
    "prompt-system\02-decision-prompts.md",
    "prompt-system\03-output-and-state.md",
    "prompt-system\04-rubrics.md",
    "prompt-system\05-impl-style.md",
    "prompt-system\06-misc.md",
    "prompt-system\rules.md",
    "prompt-system\07-protocols.md",
    "prompt-system\08-plan-actual-gate.md",
    "prompt-system\09-design-guidelines.md",
    "prompt-system\10-doc-style.md",
    "prompt-system\04b-rubrics-logical.md"
)

foreach ($rel in $loadOrder) {
    Test-FilePresent -RelPath $rel -Label "load-order file" | Out-Null
}

# ---------------------------------------------------------------------------
Write-Section "3. Integrity suites"

$suites = @(
    "test-rubric-id-integrity.ps1",
    "test-cross-reference-integrity.ps1",
    "test-self-review-protocol.ps1",
    "test-session-locks.ps1"
)

foreach ($suite in $suites) {
    $path = Join-Path $repoRoot "prompt-system\scripts\$suite"
    if (-not (Test-Path -LiteralPath $path)) {
        Add-Failure "integrity suite missing: scripts\$suite"
        continue
    }
    Write-Host "  run   scripts\$suite" -ForegroundColor Gray
    & pwsh -NoProfile -File $path 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Add-Failure "integrity suite failed: scripts\$suite (exit $LASTEXITCODE)"
    } else {
        Write-Host "  ok    scripts\$suite" -ForegroundColor Green
    }
}

# ---------------------------------------------------------------------------
Write-Section "4. Gate scripts present"

foreach ($rel in @("pre-commit.ps1", "pre-push.ps1")) {
    Test-FilePresent -RelPath $rel -Label "gate script" | Out-Null
}

# ---------------------------------------------------------------------------
Write-Section "5. Markdown lint"

if ($SkipLint) {
    Write-Host "  skip  (SkipLint)" -ForegroundColor Yellow
} else {
    $mdlintConfig = Join-Path $repoRoot ".markdownlint.jsonc"
    if (-not (Test-Path -LiteralPath $mdlintConfig)) {
        Write-Host "  skip  no .markdownlint.jsonc" -ForegroundColor Yellow
    } else {
        $npx = Get-Command npx -ErrorAction SilentlyContinue
        if (-not $npx) {
            Write-Host "  skip  npx not on PATH" -ForegroundColor Yellow
        } else {
            $mdFiles = @("AGENTS.md") + (Get-ChildItem -LiteralPath (Join-Path $repoRoot "user-guide") -Filter "*.md" -ErrorAction SilentlyContinue | ForEach-Object { "user-guide\$($_.Name)" })
            $failed = $false
            foreach ($f in $mdFiles) {
                & npx --yes markdownlint-cli --config .markdownlint.jsonc $f 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    $failed = $true
                    Add-Failure "markdownlint failed: $f"
                }
            }
            if (-not $failed) {
                Write-Host "  ok    markdownlint clean ($($mdFiles.Count) files)" -ForegroundColor Green
            }
        }
    }
}

# ---------------------------------------------------------------------------
Write-Host ""
if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) problem(s) found." -ForegroundColor Red
    exit 1
}
Write-Host "PASSED: system intact and diagnosable." -ForegroundColor Green
exit 0
