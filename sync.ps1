<#
.SYNOPSIS
    Interactive sync tool for the Baba prompt system.
.DESCRIPTION
    Discovers all projects with AGENTS.md + prompt-system/, lets you pick which
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
    [switch]$NoGitPush,
    [switch]$DeleteLegacy
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Non-interactive or broken console handles (e.g. agent execution) cannot
# support Clear-Host / Read-Host / CursorPosition. Detect that once.
$interactiveConsole = $true
try {
    $null = $Host.UI.RawUI
    $null = $Host.UI.RawUI.WindowTitle
    # Probing CursorPosition is the exact failure mode reported (German:
    # "Das Handle ist ungültig"). If it throws, treat as non-interactive.
    $testPos = $Host.UI.RawUI.CursorPosition
} catch {
    $interactiveConsole = $false
}

# ═══════════════════════════════════════════════════════════════════════════
#  Discovery
# ═══════════════════════════════════════════════════════════════════════════
# Module 37 (credential & remote-URL sanitization) is the standing H1 rule.
# Any output from this script that an LLM agent could read back MUST scrub
# remote URLs and embedded tokens before reaching stdout. Update-GitTarget
# applies the sanitizer on the push error path; do not add unsanitized
# `git remote -v` / `get-url` / `git push` calls anywhere in this file.

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
            $hasPromptSystem = Test-Path (Join-Path $dir 'prompt-system') -PathType Container
            $hasSystem = Test-Path (Join-Path $dir 'system') -PathType Container
            $hasSyncedScripts = Test-Path (Join-Path $dir 'synced-scripts') -PathType Container
            $hasAgentResources = Test-Path (Join-Path $dir 'agent-resources') -PathType Container
            if ($hasPromptSystem -or $hasSystem -or $hasSyncedScripts -or $hasAgentResources) {
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
        [switch]$NoGitPush,
        [switch]$DeleteLegacy
    )

$source  = $scriptDir
$files   = @('AGENTS.md', 'opencode.jsonc', 'BOOTSTRAP.md')
$folders = @('prompt-system', '.opencode', '.opencode/agents')
    $synced     = 0
    $skipped    = 0
    $pushFailed = 0

    # Bootstrap the global reference pool if not already present.
    & (Join-Path $scriptDir 'prompt-system\scripts\init-reference-pool.ps1')

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

        Ensure-GitignoreEntries -TargetPath $target

        # Install npm plugins declared in opencode.jsonc
        if (Test-Path (Join-Path $target '.opencode')) {
            Install-Plugins -TargetPath $target
        }

        if ($DeleteLegacy) {
            # Remove legacy folders from old structure
            $legacyFolders = @('system', 'synced-scripts', 'agent-resources', '.claude', '.cursor', '.codex')
            # Get repo root for submodule check (only if git repo)
            $repoRoot = $null
            if (Test-Path (Join-Path $target '.git')) {
                $repoRoot = & git -C $target rev-parse --show-toplevel 2>&1 | Out-Null; $repoRoot
            }
            if (-not $repoRoot) { $repoRoot = $target }
            foreach ($legacy in $legacyFolders) {
                $legacyPath = Join-Path $target $legacy
                if (-not (Test-Path $legacyPath)) { continue }

                # If this is a git submodule, deinit it before removing contents.
                $isSubmodule = $false
                if (Test-Path (Join-Path $legacyPath '.git')) {
                    $isSubmodule = $true
                } elseif (Test-Path (Join-Path $repoRoot '.gitmodules')) {
                    $modules = Get-Content -LiteralPath (Join-Path $repoRoot '.gitmodules') -Raw -ErrorAction SilentlyContinue
                    if ($modules -match [regex]::Escape($legacy)) {
                        $isSubmodule = $true
                    }
                }

                if ($isSubmodule) {
                    if (-not $DryRun) {
                        Push-Location $repoRoot
                        try {
                            & git submodule deinit -f $legacy 2>&1 | Out-Null
                        } catch { }
                        try {
                            & git rm -f $legacy 2>&1 | Out-Null
                        } catch { }
                        Pop-Location
                    }
                    Write-Host "    DEINIT submodule $legacy\" -ForegroundColor Yellow
                }

                if ($DryRun) {
                    Write-Host "    [DRY] REMOVE $legacy\" -ForegroundColor Gray
                } else {
                    Remove-Item -LiteralPath $legacyPath -Recurse -Force -ErrorAction SilentlyContinue
                    Write-Host "    REMOVED $legacy\" -ForegroundColor Yellow
                }
            }

            # Remove stray AGENTS.md symlinks from old structure
            $agentsLink = Join-Path $target 'AGENTS.md'
            if (Test-Path $agentsLink -PathType Leaf) {
                $item = Get-Item -LiteralPath $agentsLink -Force
                if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                    if ($DryRun) {
                        Write-Host "    [DRY] REMOVE AGENTS.md symlink" -ForegroundColor Gray
                    } else {
                        Remove-Item -LiteralPath $agentsLink -Force -ErrorAction SilentlyContinue
                        Write-Host "    REMOVED AGENTS.md symlink" -ForegroundColor Yellow
                    }
                }
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

# ═══════════════════════════════════════════════════════════════════════════
#  Gitignore hygiene
# ═══════════════════════════════════════════════════════════════════════════

function Ensure-GitignoreEntries {
    param([string]$TargetPath)

    $gitignorePath = Join-Path $TargetPath '.gitignore'
    if (-not (Test-Path -LiteralPath $gitignorePath -PathType Leaf)) {
        return
    }

    $content = Get-Content -LiteralPath $gitignorePath -Raw -Encoding UTF8
    $entries = @('.session-locks/', '.playwright-mcp/')
    $modified = $false

    foreach ($entry in $entries) {
        # Match the entry as a whole line, ignoring whitespace around it
        $pattern = '(?m)^\s*' + [regex]::Escape($entry) + '\s*$'
        if ($content -notmatch $pattern) {
            $content = $content.TrimEnd() + "`n" + $entry + "`n"
            $modified = $true
        }
    }

    if ($modified) {
        $content | Set-Content -LiteralPath $gitignorePath -Encoding UTF8 -NoNewline
        Write-Host "    OK  .gitignore augmented" -ForegroundColor Green
    }
}

# ═══════════════════════════════════════════════════════════════════════════
#  Plugin installer
# ═══════════════════════════════════════════════════════════════════════════

function Install-Plugins {
    param([string]$TargetPath)

    $opencodePath = Join-Path $TargetPath 'opencode.jsonc'
    if (-not (Test-Path $opencodePath)) { return }

    $sourceJson = Get-Content -LiteralPath $opencodePath -Raw -Encoding UTF8
    $cleaned = ($sourceJson -split "`n" | Where-Object { $_.TrimStart() -notmatch '^//' }) -join "`n"
    try { $config = $cleaned | ConvertFrom-Json } catch { return }

    if (-not $config.plugin) { return }

    $packageJsonPath = Join-Path (Join-Path $TargetPath '.opencode') 'package.json'
    if (-not (Test-Path $packageJsonPath)) { return }

    $pkg = Get-Content -LiteralPath $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $deps = New-Object System.Collections.Hashtable
    if ($null -ne $pkg.dependencies) {
        foreach ($prop in $pkg.dependencies.PSObject.Properties) {
            $deps[$prop.Name] = $prop.Value
        }
    }

    foreach ($entry in $config.plugin) {
        if ($entry -match '^\.') { continue }
        if ($entry -match '^(.+)@(.+)$') {
            $name = $matches[1]; $version = $matches[2]
        } else {
            $name = $entry; $version = 'latest'
        }
        if (-not $deps.ContainsKey($name) -or $deps[$name] -ne $version) {
            $deps[$name] = $version
        }
    }

    $pkg.dependencies = $deps
    $pkg | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $packageJsonPath -Encoding UTF8 -Force

    $npmCommand = $null
    try { $npmCommand = (Get-Command npm).Source } catch { $null }
    if (-not $npmCommand) { $npmCommand = 'C:\Program Files\nodejs\npm.cmd' }
    if (-not (Test-Path $npmCommand)) {
        Write-Warning "    NPM  not available -- no npm found on PATH or at default install location"
        return
    }

    Write-Host "    NPM  installing plugins" -ForegroundColor Cyan
    $oldPath = $pwd
    try {
        Set-Location (Join-Path $TargetPath '.opencode')
        $npmResult = & $npmCommand install 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "    NPM  install failed -- $npmResult"
        } else {
            Write-Host "    NPM  OK" -ForegroundColor Green
        }
    } catch {
        Write-Warning "    NPM  not available -- $_"
    } finally {
        Set-Location $oldPath
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
        Write-Host '    [DRY] git add AGENTS.md opencode.jsonc BOOTSTRAP.md prompt-system/ .opencode/' -ForegroundColor Gray
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

$paths = @('AGENTS.md', 'opencode.jsonc', 'BOOTSTRAP.md', 'prompt-system', '.opencode') |
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
        # Capture and sanitize: git prints `To <url>` on success and may include
        # remote URLs in error output. The exit code is the real signal; the
        # branch pointer is enough human-readable evidence. Never let an
        # unsanitized line reach stdout (module 37 / H1).
        $raw = & git -C $repoRoot push origin $branch 2>&1
        if ($LASTEXITCODE -ne 0) {
            $scrubbed = ($raw -join "`n") -replace 'https?://\S+', '<url>' `
                                          -replace 'oauth2:[^@\s]+@', 'oauth2:<token>@'
            Write-Warning "git push origin $branch failed (exit $LASTEXITCODE) for $Path`n$scrubbed"
            return $true
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

# Clear-Host fails when the console handle is invalid (e.g. agent/session
# execution with no interactive TTY). Wrap each call independently.
function Invoke-ClearHostSafe {
    try {
        Clear-Host -ErrorAction Stop
    } catch {
        # Non-terminating; non-interactive runs skip the clear silently.
    }
}

Invoke-ClearHostSafe
Write-Host '========================================' -ForegroundColor DarkCyan
Write-Host '  Baba Prompt System - Sync Tool'        -ForegroundColor White
Write-Host '========================================' -ForegroundColor DarkCyan
Write-Host ''

Write-Host 'Scanning for projects...' -ForegroundColor DarkGray
$targets = Find-Targets -Roots $DRIVES
$keys    = @($targets.Keys)

if ($keys.Count -eq 0) {
    Write-Host 'No projects found on C:\, M:\, H:\.' -ForegroundColor Red
    Write-Host 'Add AGENTS.md + prompt-system/ to a project first.' -ForegroundColor Gray
    exit 1
}

# Regenerate adapter mirrors before every sync so targets never receive stale
# hand-copied duplicates (sources: .opencode/ tree + opencode.jsonc mcp block).
try {
    & (Join-Path $scriptDir 'generate-adapters.ps1')
} catch {
    Write-Error "generate-adapters.ps1 failed - fix it before syncing: $_"
    exit 1
}

if ($All) {
    foreach ($key in $keys) { $targets[$key] = $true }
    Sync-Targets -Targets $targets -DryRun:$DryRun -NoGitPush:$NoGitPush -DeleteLegacy:$DeleteLegacy
    exit 0
}

$all       = $true
$dryMode   = $DryRun
$gitPush   = -not $NoGitPush
$refresh   = $false

if (-not $interactiveConsole) {
    Write-Host '`nInteractive console unavailable (no valid $Host.UI.RawUI handle). Use -All or -DryRun for non-interactive operation.' -ForegroundColor DarkGray
    exit 0
}

while ($true) {
    if ($refresh) {
        Write-Host "`nRescanning..." -ForegroundColor DarkGray
        $targets = Find-Targets -Roots $DRIVES
        $keys    = @($targets.Keys)
        $refresh = $false
    }

    Invoke-ClearHostSafe
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
    Write-Host '  [L]  Delete legacy' -NoNewline
    Write-Host ($(if ($deleteLegacy) {'ON'} else {'OFF'})) -ForegroundColor $(if ($deleteLegacy) {'Yellow'} else {'DarkGray'})
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
            Sync-Targets -Targets $targets -DryRun:$dryMode -NoGitPush:(-not $gitPush) -DeleteLegacy:$DeleteLegacy
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
