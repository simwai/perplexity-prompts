<#
.SYNOPSIS
    Interactive sync tool for the Baba prompt system.
.DESCRIPTION
    Discovers all projects with AGENTS.md + system/, lets you pick which
    to update, and syncs them. After each successful sync, targets that are
    git repositories get the synced files committed and pushed to their
    origin remote (use -NoGitPush to skip). Run with no arguments for the
    interactive menu.
    The configured target list lives in targets.json at this script's
    directory (plain JSON array of absolute project paths). Paths are
    expanded for environment variables; entries pointing at missing
    directories are skipped. This file is operational tooling for the
    developer, not part of the prompt-system runtime: no prompt module
    reads it. The module-33 commit/push gate handles the current repo's
    own origin + `*-mirror` remotes independently of this sync flow.
.EXAMPLE
    .\sync.ps1
.EXAMPLE
    .\sync.ps1 -All -NoGitPush
#>
param(
    [switch]$All,
    [switch]$DryRun,
    [switch]$NoGitPush
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ═══════════════════════════════════════════════════════════════════════════
#  Discovery
# ═══════════════════════════════════════════════════════════════════════════

function Find-Targets {
    param([string[]]$Roots)

    $targets = [ordered]@{}
    $source  = $scriptDir
    $rg      = Get-Command rg -ErrorAction SilentlyContinue

    foreach ($root in $Roots) {
        $root = $ExecutionContext.InvokeCommand.ExpandString($root)
        if (-not (Test-Path $root)) { continue }

        if ($rg) {
            $hits = & rg --files --glob 'AGENTS.md' --no-ignore --max-depth 6 --no-messages $root 2>$null
        } else {
            $hits = Get-ChildItem -Path $root -Directory -Recurse -Depth 5 -ErrorAction SilentlyContinue |
                Where-Object { Test-Path (Join-Path $_.FullName 'AGENTS.md') } |
                ForEach-Object { Join-Path $_.FullName 'AGENTS.md' }
        }

        foreach ($hit in $hits) {
            $dir = Split-Path -Parent $hit
            if ($dir -eq $source) { continue }
            if (Test-Path (Join-Path $dir 'system') -PathType Container) {
                if (-not $targets.Contains($dir)) {
                    $targets[$dir] = $false  # false = not selected
                }
            }
        }
    }

    $configPath = Join-Path $scriptDir 'targets.json'
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $configuredTargets = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        foreach ($target in $configuredTargets) {
            if ($target -is [string] -and $target.Trim() -and $target -ne $source) {
                $targets[$target] = $false
            }
        }
    }

    return $targets
}

# ═══════════════════════════════════════════════════════════════════════════
#  Sync engine
# ═══════════════════════════════════════════════════════════════════════════

function Sync-Targets {
    param(
        [hashtable]$Targets,
        [switch]$DryRun,
        [switch]$NoGitPush
    )

    $source  = $scriptDir
    $files   = @('AGENTS.md', 'opencode.jsonc')
    $folders = @('system', '.opencode')
    $synced     = 0
    $skipped    = 0
    $pushFailed = 0

    $selected = $Targets.GetEnumerator() | Where-Object { $_.Value } | ForEach-Object { $_.Key }

    if (-not $selected) {
        Write-Host 'Nothing selected to sync.' -ForegroundColor Yellow
        return
    }

    Write-Host "`nSyncing...`n" -ForegroundColor White

    foreach ($target in $selected) {
        if (-not (Test-Path $target)) {
            Write-Warning "SKIP (missing): $target"
            $skipped++
            continue
        }

        Write-Host "  $target" -ForegroundColor Cyan

        foreach ($file in $files) {
            $src = Join-Path $source $file
            if ($DryRun) {
                Write-Host "    [DRY] $file" -ForegroundColor Gray
            } else {
                Copy-Item -Path $src -Destination $target -Force
                Write-Host "    OK  $file" -ForegroundColor Green
            }
        }

        foreach ($folder in $folders) {
            $src = Join-Path $source $folder
            $dst = Join-Path $target $folder
            if ($DryRun) {
                Write-Host "    [DRY] $folder\" -ForegroundColor Gray
            } else {
                & robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /R:2 /W:2
                if ($LASTEXITCODE -ge 8) {
                    Write-Error "robocopy failed for $folder (exit code $LASTEXITCODE)"
                    return
                }
                Write-Host "    OK  $folder\" -ForegroundColor Green
            }
        }
        $synced++
        $pushFailed += [int](Update-GitTarget -Path $target -DryRun:$DryRun -NoGitPush:$NoGitPush)
    }

    $summary = "`nDone. $synced synced, $skipped skipped"
    if ($pushFailed -gt 0) {
        Write-Host "$summary, $pushFailed push failed." -ForegroundColor Yellow
    } else {
        Write-Host "$summary." -ForegroundColor White
    }
}

function Update-GitTarget {
    param(
        [string]$Path,
        [switch]$DryRun,
        [switch]$NoGitPush
    )

    # Native git stderr would become a terminating error under the script's
    # $ErrorActionPreference='Stop' (PS 5.1 behavior). This function owns its
    # failure handling via $LASTEXITCODE, so 'Continue' is safe here.
    $ErrorActionPreference = 'Continue'

    if ($NoGitPush) {
        Write-Host '    GIT  commit/push disabled' -ForegroundColor DarkGray
        return
    }

    if ($DryRun) {
        Write-Host '    [DRY] git add AGENTS.md opencode.jsonc system/ .opencode/' -ForegroundColor Gray
        Write-Host '    [DRY] git commit + git push origin <branch>' -ForegroundColor Gray
        return
    }

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Warning "SKIP git: git not found for $Path"
        return
    }

    $repoRoot = & git -C $Path rev-parse --show-toplevel 2>&1
    if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
        Write-Host '    GIT  not a git repository, skipped' -ForegroundColor DarkGray
        return
    }

    $paths = @('AGENTS.md', 'opencode.jsonc', 'system', '.opencode') |
        Where-Object { Test-Path (Join-Path $repoRoot $_) }
    if (-not $paths) { return }

    # Stage only the synced paths; never sweep in unrelated work.
    & git -C $repoRoot add -- $paths 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "git add failed for $Path"
        return
    }

    & git -C $repoRoot diff --cached --quiet 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host '    GIT  no changes to commit' -ForegroundColor DarkGray
        return
    }

    $branch = & git -C $repoRoot branch --show-current 2>&1
    if (-not $branch) {
        Write-Warning "SKIP git: detached HEAD in $Path"
        return
    }

    # Conventional-commit message: target repos with husky/commitlint (e.g.
    # biome-formatter-vscode, perplexity-ai-export) reject a subject without a
    # type prefix, which used to fail the commit there every sync.
    & git -C $repoRoot commit -m 'chore: sync baba prompt system' 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "git commit failed for $Path"
        return
    }
    $sha = & git -C $repoRoot rev-parse --short HEAD 2>&1
    Write-Host "    GIT  committed $sha" -ForegroundColor Green

    $remotes = @(& git -C $repoRoot remote 2>&1)
    if ($remotes -notcontains 'origin') {
        Write-Host '    GIT  no origin remote, push skipped' -ForegroundColor DarkGray
        return $false
    }

    # Fail fast instead of hanging on an interactive credential prompt;
    # restore the caller's GIT_TERMINAL_PROMPT afterwards.
    $previousPrompt = $env:GIT_TERMINAL_PROMPT
    $env:GIT_TERMINAL_PROMPT = '0'
    try {
        & git -C $repoRoot push origin $branch 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "push exit code $LASTEXITCODE"
        }
        Write-Host "    GIT  pushed origin $branch" -ForegroundColor Green
        return $false
    }
    catch {
        Write-Warning "git push origin $branch failed for $Path"
        return $true
    }
    finally {
        if ($null -eq $previousPrompt) {
            Remove-Item Env:GIT_TERMINAL_PROMPT -ErrorAction SilentlyContinue
        } else {
            $env:GIT_TERMINAL_PROMPT = $previousPrompt
        }
    }
}

function Get-Checkmark {
    param([bool]$val)
    if ($val) { return '[x]' } else { return '[ ]' }
}

# ═══════════════════════════════════════════════════════════════════════════
#  Main menu
# ═══════════════════════════════════════════════════════════════════════════

$DRIVES = @('C:\', 'M:\', 'H:\')

Clear-Host
Write-Host '========================================' -ForegroundColor DarkCyan
Write-Host '  Baba Prompt System - Sync Tool'        -ForegroundColor White
Write-Host '========================================' -ForegroundColor DarkCyan
Write-Host ''

Write-Host 'Scanning for projects...' -ForegroundColor DarkGray
$targets = Find-Targets -Roots $DRIVES
$keys    = @($targets.Keys)

if ($keys.Count -eq 0) {
    Write-Host 'No projects found on C:\, M:\, H:\.' -ForegroundColor Red
    Write-Host 'Add AGENTS.md + system/ to a project first.' -ForegroundColor Gray
    exit 1
}

if ($All) {
    foreach ($key in $keys) { $targets[$key] = $true }
    Sync-Targets -Targets $targets -DryRun:$DryRun -NoGitPush:$NoGitPush
    exit 0
}

$all       = $true
$dryMode   = $DryRun
$gitPush   = -not $NoGitPush
$refresh   = $false

while ($true) {
    if ($refresh) {
        Write-Host "`nRescanning..." -ForegroundColor DarkGray
        $targets = Find-Targets -Roots $DRIVES
        $keys    = @($targets.Keys)
        $refresh = $false
    }

    Clear-Host
    Write-Host '========================================' -ForegroundColor DarkCyan
    Write-Host '  Baba Prompt System - Sync Tool'        -ForegroundColor White
    Write-Host '========================================' -ForegroundColor DarkCyan
    Write-Host ''

    $i = 1
    foreach ($key in $keys) {
        $indicator = Get-Checkmark $targets[$key]
        $color = if ($targets[$key]) { 'White' } else { 'DarkGray' }
        Write-Host "  $indicator  $i  $key" -ForegroundColor $color
        $i++
    }

    Write-Host ''
    Write-Host '────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host "  [A]  Toggle all  ($(if ($all) {'deselect'} else {'select'}))"
    Write-Host '  [D]  Dry-run     ' -NoNewline
    Write-Host ($(if ($dryMode) {'ON'} else {'OFF'})) -ForegroundColor $(if ($dryMode) {'Yellow'} else {'DarkGray'})
    Write-Host '  [G]  Git push    ' -NoNewline
    Write-Host ($(if ($gitPush) {'ON'} else {'OFF'})) -ForegroundColor $(if ($gitPush) {'Green'} else {'DarkGray'})
    Write-Host '  [S]  Sync now'
    Write-Host '  [R]  Rescan'
    Write-Host '  [Q]  Quit'
    Write-Host '────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host -NoNewline 'Choice: ' -ForegroundColor Cyan

    $choice = Read-Host

    switch -Regex ($choice.Trim().ToUpper()) {
        '^Q$' {
            Write-Host 'Bye.' -ForegroundColor Gray
            return
        }
        '^A$' {
            $all = -not $all
            foreach ($key in $keys) { $targets[$key] = $all }
        }
        '^D$' {
            $dryMode = -not $dryMode
        }
        '^G$' {
            $gitPush = -not $gitPush
        }
        '^R$' {
            $refresh = $true
            break
        }
        '^S$' {
            Sync-Targets -Targets $targets -DryRun:$dryMode -NoGitPush:(-not $gitPush)
            Write-Host ''
            Write-Host -NoNewline 'Press Enter to return...' -ForegroundColor DarkGray
            Read-Host | Out-Null
        }
        '^\d+$' {
            $idx = [int]$choice - 1
            if ($idx -ge 0 -and $idx -lt $keys.Count) {
                $key = $keys[$idx]
                $targets[$key] = -not $targets[$key]
            } else {
                Write-Host "Invalid number: $choice" -ForegroundColor Red
                Start-Sleep -Milliseconds 800
            }
        }
        default {
            Write-Host "Unknown: $choice" -ForegroundColor Red
            Start-Sleep -Milliseconds 600
        }
    }
}
