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

$totalSteps = 8
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

# Content fingerprint that agrees with git, without paying a process per file.
#
# A raw SHA256 over the file bytes disagrees with git whenever the working tree
# carries CRLF and .gitattributes normalises to LF (`* text=auto eol=lf`). Git
# treats those files as unchanged while a byte hash sees a difference, which
# made the adapter-regeneration check below report spurious changes and block
# every commit until the tree happened to be LF.
#
# `git hash-object --path` would apply git's own clean filter, but it spawns a
# process per file and the generated tree has hundreds of files, which turned
# the gate into a multi-minute hang. Replicating the normalisation in-process
# is equivalent for text files and costs one read each.
function Get-NormalizedContentId {
    param([string]$Path)

    $text = [System.IO.File]::ReadAllText($Path)
    if ($text.IndexOf("`r`n") -ge 0) {
        $text = $text.Replace("`r`n", "`n")
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text))
        return [System.BitConverter]::ToString($hash).Replace('-', '')
    } finally {
        $sha.Dispose()
    }
}

function Get-GeneratedFileMap {
    param([string[]]$Dirs)

    $map = @{}
    foreach ($dir in $Dirs) {
        $full = Join-Path $repoRoot $dir
        if (-not (Test-Path -LiteralPath $full -PathType Container)) { continue }
        foreach ($f in (Get-ChildItem -LiteralPath $full -Recurse -File)) {
            $rel = $f.FullName.Substring($repoRoot.Length).TrimStart('\', '/') -replace '\\', '/'
            $map[$rel] = Get-NormalizedContentId -Path $f.FullName
        }
    }
    return $map
}

# ── 1. Session lock gate ────────────────────────────────────────────────────
Write-Host "`n[1/$totalSteps] Checking session locks..." -ForegroundColor Yellow

# Deliberately the first step: every step below it can rewrite files, and a
# commit that is going to be refused must not first have its tree auto-fixed by
# this hook.
#
# Engaged when >= 1 live lock exists in .session-locks/. In engaged state:
# hard refusal for unattributed commits (no SESSION_ID) or uncovered staged paths;
# peer conflicts still refuse. Non-engaged (no locks present): lockless commits
# pass (cooperative, zero ceremony for single-session use).

$locksScript = Join-Path $repoRoot 'prompt-system\scripts\session-locks.ps1'

if (-not (Test-Path -LiteralPath $locksScript -PathType Leaf)) {
    Write-Warning "  session-locks.ps1 not found -- lock gate SKIPPED"
} else {
    $stagedForLocks = @(& git -C $repoRoot diff --cached --name-only --diff-filter=ACM 2>$null)

    if (-not $stagedForLocks) {
        Write-Host "  No staged files -- lock gate SKIPPED" -ForegroundColor Gray
    } else {
        . $locksScript

        $gateEval = Get-LockGateEvaluation -StagedPaths $stagedForLocks -RepoRoot $repoRoot

        if ($gateEval.Skipped) {
            Write-Warning "  Lock gate skipped: $($gateEval.Reason)"
        } elseif (-not $gateEval.Engaged) {
            Write-Host "  No live locks present -- lockless commits allowed (non-engaged)" -ForegroundColor Green
        } elseif ($gateEval.ShouldBlock) {
            if ($gateEval.Type -eq 'Unattributed') {
                Write-Error $gateEval.Reason
                Write-Error "  Set SESSION_ID to enable attribution (e.g. . ./scripts/enter-session.ps1)"
                exit 1
            } elseif ($gateEval.Type -eq 'PeerConflict') {
                $lockReport = @($gateEval.Conflicts | ForEach-Object {
                    $owners = @($_.Peers | ForEach-Object { "$($_.Owner) ($($_.Type))" }) -join ', '
                    "  $($_.Path) -- held by $owners"
                })
                Write-Error "Staged files are held by a live peer session lock:"
                $lockReport | ForEach-Object { Write-Error $_ }
                Write-Error "Wait for the peer to commit or release, or skip the path. This hook never steals a lock."
                exit 1
            } elseif ($gateEval.Type -eq 'Uncovered') {
                Write-Error $gateEval.Reason
                $gateEval.Uncovered | ForEach-Object { Write-Error "  Uncovered: $_" }
                Write-Error "In engaged mode, all staged paths must be covered by locks held by this session."
                exit 1
            } else {
                Write-Error $gateEval.Reason
                exit 1
            }
        } else {
            Write-Host "  Lock gate passed (engaged)" -ForegroundColor Green
        }
    }
}

# ── 2. Generate platform adapters ───────────────────────────────────────────
Write-Host "`n[2/$totalSteps] Generating adapters..." -ForegroundColor Yellow

# All outputs produced by generate-adapters.ps1. These are derived from
# opencode.jsonc + adapters/ templates, so the commit must contain the
# generator's output, not stale hand-edited content.
$generatedOutputs = @(
    '.mcp.json',
    'kilo.json',
    '.claude/settings.json',
    '.claude/agents',
    '.claude/skills',
    '.opencode/agents',
    '.opencode/commands',
    '.kilo/agent',
    '.kilo/command',
    '.kilo/skills'
)

& (Join-Path $repoRoot 'generate-adapters.ps1')
if (-not $?) {
    Write-Error "Adapter generation failed"
    exit 1
}

# Re-stage generated outputs so they are part of the commit.
$toAdd = @()
foreach ($out in $generatedOutputs) {
    $abs = Join-Path $repoRoot $out
    if (Test-Path -LiteralPath $abs) {
        $toAdd += $out
    }
}
if ($toAdd.Count -gt 0) {
    & git -C $repoRoot add -- $toAdd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to stage generated adapter outputs: $($toAdd -join ', ')"
        exit 1
    }
}
Write-Host "  Generated adapters staged" -ForegroundColor Green

# ── 3. Mermaid diagram syntax ────────────────────────────────────────────────
Write-Host "`n[3/$totalSteps] Validating Mermaid diagrams..." -ForegroundColor Yellow

# Scoped to staged Markdown. A diagram that fails to parse renders as a
# syntax-error box on GitHub and nothing else here catches it: markdownlint
# checks Markdown, not diagram grammar, and the cross-reference suite checks
# citations, not diagram bodies. Files with no ```mermaid fence are skipped
# without starting a browser, so commits that touch no diagram cost nothing.
$mermaidScript = Join-Path $repoRoot 'scripts\test-mermaid.ps1'
if (-not (Test-Path -LiteralPath $mermaidScript -PathType Leaf)) {
    Write-Warning '  scripts\test-mermaid.ps1 not found -- Mermaid validation SKIPPED'
} else {
    $mermaidOutput = & pwsh -NoProfile -File $mermaidScript -StagedOnly 2>&1
    $mermaidCode = $LASTEXITCODE
    $mermaidOutput | ForEach-Object { Write-Host "  $_" }
    if ($mermaidCode -ne 0) {
        Write-Error 'Mermaid syntax validation failed -- a diagram does not parse.'
        exit 1
    }
}

# ── 4. Prompt-system integrity suites ───────────────────────────────────────
Write-Host "`n[4/$totalSteps] Running prompt-system integrity suites..." -ForegroundColor Yellow

$integritySuites = @(
    'prompt-system\scripts\test-rubric-id-integrity.ps1',
    'prompt-system\scripts\test-session-locks.ps1',
    'prompt-system\scripts\test-cross-reference-integrity.ps1',
    'prompt-system\scripts\test-self-review-protocol.ps1',
    'prompt-system\scripts\test-phase-graph.ps1',
    'prompt-system\scripts\test-decision-format.ps1',
    'prompt-system\scripts\test-registry-drift.ps1',
    'prompt-system\scripts\test-manifest-io.ps1'
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

# ── 5. File hygiene (staged files) ──────────────────────────────────────────
Write-Host "`n[5/$totalSteps] Checking file hygiene..." -ForegroundColor Yellow

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

# ── 6. Secret scanning (staged files) ───────────────────────────────────────
Write-Host "`n[6/$totalSteps] Scanning staged files for secrets..." -ForegroundColor Yellow

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

# ── 7. Markdown lint (staged files) ─────────────────────────────────────────
Write-Host "`n[7/$totalSteps] Linting staged Markdown..." -ForegroundColor Yellow

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

# ── 8. PowerShell Script Analyzer (staged files) ────────────────────────────
Write-Host "`n[8/$totalSteps] Analyzing staged PowerShell..." -ForegroundColor Yellow

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
