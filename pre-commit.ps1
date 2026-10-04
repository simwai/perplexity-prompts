<#
.SYNOPSIS
    Self-contained pre-commit hook for the Baba prompt system.
.DESCRIPTION
    Runs generate-adapters.ps1, the prompt-system integrity suites, and repo
    hygiene checks directly without an external framework.

    Order matters: adapters are regenerated first so every later check sees the
    current tree, and integrity suites run before hygiene fixes so a broken
    cross-reference is reported rather than silently rewritten.

    Scope: every gate that inspects or rewrites files is scoped to the STAGED
    file set, matching the lint-staged convention ("formatter runs first, linter
    second, on staged files only"). This hook gates the change under review, not
    the repository's historical backlog. Auto-fixes never stage; when a fix
    dirties the tree the hook fails loudly and names the paths.
.PHONY pre-commit
#>

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# The script lives at the repo root (not in scripts/), so the root is the script
# directory itself when it holds generate-adapters.ps1; otherwise its parent.
$repoRoot = if (Test-Path (Join-Path $scriptDir 'generate-adapters.ps1')) { $scriptDir } else { Split-Path -Parent $scriptDir }

$totalSteps = 6
Write-Host "Running pre-commit checks..." -ForegroundColor Cyan

# Paths excluded from every check below. `pre-commit.ps1` is deliberately NOT
# excluded: gates are scoped to staged files, so when this script is the thing
# being committed it must lint and analyse itself. The re-stage guard below stops
# a self-fix from becoming a silently half-applied commit.
$excludePaths = @('\.git\\', '\\node_modules\\', '\.opencode\\node_modules\\')

function Should-Exclude {
    param([string]$Path)
    foreach ($pattern in $excludePaths) {
        if ($Path -match $pattern) { return $true }
    }
    return $false
}

# Read and write through the .NET file APIs. Get-Content/Set-Content round-trips
# through the console encoding on Windows PowerShell 5.1, which corrupts the
# UTF-8 emoji in README.md and drops the trailing newline via -NoNewline.
function Get-TextUtf8 {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path)
}

function Set-TextUtf8 {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

# Absolute paths for every Markdown / PowerShell file currently staged.
function Get-StagedFiles {
    param([string[]]$Extensions)

    $staged = @(& git -C $repoRoot diff --cached --name-only --diff-filter=ACM 2>$null)
    if (-not $staged) { return @() }

    $result = @()
    foreach ($rel in $staged) {
        $ext = [System.IO.Path]::GetExtension($rel)
        if ($Extensions -notcontains $ext) { continue }
        $abs = Join-Path $repoRoot ($rel -replace '/', '\')
        if (-not (Test-Path -LiteralPath $abs -PathType Leaf)) { continue }
        if (Should-Exclude $abs) { continue }
        $result += $abs
    }
    return $result
}

# ── 1. Generate platform adapters ───────────────────────────────────────────
Write-Host "`n[1/$totalSteps] Generating adapters..." -ForegroundColor Yellow

# Snapshot the generated tree before regenerating. The invariant to enforce is
# "generation changed something", not "the tree differs from the index": a
# generated file that was already dirty from an unrelated in-progress adapter
# edit is not this hook's business, and comparing against the index would flag it.
$generatedDirs = @('.opencode', '.claude')

$before = @{}
foreach ($dir in $generatedDirs) {
    $full = Join-Path $repoRoot $dir
    if (-not (Test-Path -LiteralPath $full -PathType Container)) { continue }
    foreach ($f in (Get-ChildItem -LiteralPath $full -Recurse -File)) {
        $rel = $f.FullName.Substring($repoRoot.Length)
        $before[$rel] = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash
    }
}

& (Join-Path $repoRoot 'generate-adapters.ps1')
if (-not $?) {
    Write-Error "Adapter generation failed"
    exit 1
}

$regenerated = @()
foreach ($dir in $generatedDirs) {
    $full = Join-Path $repoRoot $dir
    if (-not (Test-Path -LiteralPath $full -PathType Container)) { continue }
    foreach ($f in (Get-ChildItem -LiteralPath $full -Recurse -File)) {
        $rel = $f.FullName.Substring($repoRoot.Length)
        $hash = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash
        if ((-not $before.ContainsKey($rel)) -or ($before[$rel] -ne $hash)) {
            $regenerated += $rel
        }
    }
}

if ($regenerated) {
    Write-Error "Adapter generation changed the following file(s) -- re-stage and commit:"
    $regenerated | Sort-Object | ForEach-Object { Write-Error "  $_" }
    Write-Error "Run .\generate-adapters.ps1, then 'git add' the paths above."
    exit 1
}
Write-Host "  Generated adapters already current ($($before.Count) files checked)" -ForegroundColor Green

# ── 2. Prompt-system integrity suites ───────────────────────────────────────
Write-Host "`n[2/$totalSteps] Running prompt-system integrity suites..." -ForegroundColor Yellow

$integritySuites = @(
    'prompt-system\scripts\test-rubric-id-integrity.ps1',
    'prompt-system\scripts\test-cross-reference-integrity.ps1',
    'prompt-system\scripts\test-self-review-protocol.ps1'
)

$integrityFailed = $false
foreach ($suite in $integritySuites) {
    $suitePath = Join-Path $repoRoot $suite
    if (-not (Test-Path -LiteralPath $suitePath -PathType Leaf)) {
        Write-Warning "  Missing integrity suite: $suite"
        $integrityFailed = $true
        continue
    }
    $output = & pwsh -NoProfile -File $suitePath 2>&1
    $code = $LASTEXITCODE
    $output | ForEach-Object { Write-Host "  $_" }
    if ($code -ne 0) {
        $integrityFailed = $true
        Write-Error "  FAILED: $suite"
    }
}

if ($integrityFailed) {
    Write-Error "Prompt-system integrity suites failed. Fix the reported defects before committing."
    exit 1
}

# ── 3. File hygiene (staged files) ──────────────────────────────────────────
Write-Host "`n[3/$totalSteps] Checking file hygiene..." -ForegroundColor Yellow

$stagedText = @(Get-StagedFiles -Extensions @('.md', '.yaml', '.yml', '.json', '.toml', '.ps1', '.psd1', '.psm1', '.txt'))
$dirty = @()

if (-not $stagedText) {
    Write-Host "  No staged text files -- hygiene SKIPPED" -ForegroundColor Gray
} else {
    # Trailing spaces and tabs at end of line. The pattern is line-anchored so it
    # cannot consume the line terminator and swallow the EOF newline.
    $trailingPattern = [regex]'[ \t]+(?=\r?$)'
    $multiline = [System.Text.RegularExpressions.RegexOptions]::Multiline

    foreach ($path in $stagedText) {
        $content = Get-TextUtf8 $path
        $fixed = $trailingPattern.Replace($content, '', $multiline)
        if ($fixed -ne $content) {
            Set-TextUtf8 -Path $path -Content $fixed
            $dirty += $path
        }
    }

    # Missing newline at end of file.
    $eofDirty = @()
    foreach ($path in $stagedText) {
        $content = Get-TextUtf8 $path
        if ($content.Length -eq 0) { continue }
        if (-not $content.EndsWith("`n")) {
            Set-TextUtf8 -Path $path -Content ($content + "`n")
            $eofDirty += $path
        }
    }

    if ($dirty) {
        Write-Warning "Removed trailing whitespace from $($dirty.Count) file(s):"
        $dirty | ForEach-Object { Write-Warning "  $_" }
    } else {
        Write-Host "  No trailing whitespace" -ForegroundColor Green
    }

    if ($eofDirty) {
        Write-Warning "Added missing EOF newline to $($eofDirty.Count) file(s):"
        $eofDirty | ForEach-Object { Write-Warning "  $_" }
    } else {
        Write-Host "  All staged files have EOF newline" -ForegroundColor Green
    }

    # Merge conflict markers.
    $conflicts = @($stagedText | Where-Object { (Get-TextUtf8 $_) -match '(?m)^(<<<<<<< |=======$|>>>>>>> )' })
    if ($conflicts) {
        Write-Error "Staged files with merge conflict markers (must resolve manually):"
        $conflicts | ForEach-Object { Write-Error "  $_" }
        exit 1
    }
    Write-Host "  No merge conflict markers" -ForegroundColor Green

    # A hygiene fix that is not staged is a silently half-applied commit.
    if ($dirty.Count + $eofDirty.Count -gt 0) {
        Write-Error "Hygiene auto-fixes changed files. Re-stage them and commit again:"
        ($dirty + $eofDirty) | Sort-Object -Unique | ForEach-Object { Write-Error "  $_" }
        exit 1
    }
}

# ── 4. Secret scanning (staged files) ───────────────────────────────────────
Write-Host "`n[4/$totalSteps] Scanning staged files for secrets..." -ForegroundColor Yellow

$secretPatterns = @(
    'api[_-]?key\s*[:=]\s*["'']?[a-zA-Z0-9_\-]{20,}',
    'secret\s*[:=]\s*["'']?[a-zA-Z0-9_\-]{20,}',
    'token\s*[:=]\s*["'']?[a-zA-Z0-9_\-]{20,}',
    'password\s*[:=]\s*["'']?[a-zA-Z0-9_\-]{8,}',
    'aws[_-]?access[_-]?key\s*[:=]\s*["'']?[A-Z0-9]{20}',
    '-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----',
    'ssh-rsa\s+[A-Za-z0-9+/]+[=]{0,2}'
)

# Files that legitimately contain secret-detection regexes as data rather than
# secrets. `opencode-vibeguard` is a plugin of this repo (opencode.jsonc), and its
# config embeds those patterns as data.
$secretPatternFiles = @('vibeguard.config.json')

$binaryExtensions = @('.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz')

$stagedAll = @(Get-StagedFiles -Extensions @('.md', '.yaml', '.yml', '.json', '.toml', '.ps1', '.psd1', '.psm1', '.txt', '.js', '.ts', '.py'))

$secrets = @($stagedAll |
    Where-Object { $secretPatternFiles -notcontains (Split-Path $_ -Leaf) } |
    Where-Object {
        $content = Get-TextUtf8 $_
        foreach ($pattern in $secretPatterns) {
            if ($content -match $pattern) { return $true }
        }
        return $false
    })

if ($secrets) {
    Write-Error "Potential secrets in staged files:"
    $secrets | ForEach-Object { Write-Error "  $_" }
    Write-Error "If these are false positives, narrow the pattern or gitignore the file."
    exit 1
}
Write-Host "  No secrets detected in staged files" -ForegroundColor Green

# ── 5. Markdown lint (staged files) ──────────────────────────────────────────
Write-Host "`n[5/$totalSteps] Linting staged Markdown..." -ForegroundColor Yellow

$stagedMd = @(Get-StagedFiles -Extensions @('.md'))

if (-not $stagedMd) {
    Write-Host "  No staged Markdown files -- lint SKIPPED" -ForegroundColor Gray
} elseif (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Warning "  Node.js not found -- markdownlint SKIPPED (no linter available)"
} else {
    # Warn-only would let auto-fixable issues reach the tree, which the per-edit
    # lint gate forbids. This is a blocking gate.
    #
    # Batched because Windows caps a native command line at 8191 characters, which
    # the repo's full Markdown set (~160 files) blows straight through.
    $batchSize = 40
    $lintFailures = @()

    for ($i = 0; $i -lt $stagedMd.Count; $i += $batchSize) {
        $end = [Math]::Min($i + $batchSize, $stagedMd.Count)
        $batch = $stagedMd[$i..($end - 1)]
        $lintResult = & npx markdownlint-cli --config "$repoRoot\.markdownlint.jsonc" @batch 2>&1
        if ($LASTEXITCODE -ne 0) {
            $lintFailures += ,@($batch, $lintResult)
        }
    }

    if ($lintFailures) {
        Write-Error "Markdown lint failed on staged files (auto-fix with 'npx markdownlint-cli --fix --config .markdownlint.jsonc'):"
        foreach ($failure in $lintFailures) {
            $failure[1] | ForEach-Object { Write-Error "  $_" }
        }
        exit 1
    }
    Write-Host "  Markdown lint passed ($($stagedMd.Count) staged file(s))" -ForegroundColor Green
}

# ── 6. PowerShell Script Analyzer (staged files) ────────────────────────────
Write-Host "`n[6/$totalSteps] Analyzing staged PowerShell..." -ForegroundColor Yellow

$stagedPs = @(Get-StagedFiles -Extensions @('.ps1'))

if (-not $stagedPs) {
    Write-Host "  No staged PowerShell files -- analysis SKIPPED" -ForegroundColor Gray
} elseif (-not (Get-Module -ListAvailable -Name PSScriptAnalyzer)) {
    Write-Warning "  PSScriptAnalyzer not installed -- analysis SKIPPED"
} else {
    Import-Module PSScriptAnalyzer -ErrorAction SilentlyContinue
    $issues = @()
    foreach ($file in $stagedPs) {
        $fileIssues = Invoke-ScriptAnalyzer -Path $file -Severity Error -ExcludeRule @('PSAvoidUsingWriteHost', 'PSAvoidGlobalVars') -ErrorAction SilentlyContinue
        if ($fileIssues) { $issues += $fileIssues }
    }
    if ($issues) {
        Write-Error "PSScriptAnalyzer found errors in staged files:"
        $issues | Format-Table RuleName, Severity, Line, Message, ScriptName -AutoSize | Out-Host
        exit 1
    }
    Write-Host "  PowerShell analysis passed ($($stagedPs.Count) staged file(s))" -ForegroundColor Green
}

Write-Host "`nAll pre-commit checks passed!" -ForegroundColor Green
exit 0
