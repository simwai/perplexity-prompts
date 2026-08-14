<#
.SYNOPSIS
    Interactive sync tool for the Baba prompt system.
.DESCRIPTION
    Discovers all projects with AGENTS.md + system/, lets you pick which
    to update, and syncs them. Run with no arguments for the interactive menu.
.EXAMPLE
    .\sync.ps1
#>
param(
    [switch]$All,
    [switch]$DryRun
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
        [switch]$DryRun
    )

    $source  = $scriptDir
    $files   = @('AGENTS.md', 'opencode.jsonc')
    $folders = @('system', '.opencode')
    $synced  = 0
    $skipped = 0

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
    }

    Write-Host "`nDone. $synced synced, $skipped skipped." -ForegroundColor White
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
    Sync-Targets -Targets $targets -DryRun:$DryRun
    exit 0
}

$all       = $true
$dryMode   = $DryRun
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
        '^R$' {
            $refresh = $true
            break
        }
        '^S$' {
            Sync-Targets -Targets $targets -DryRun:$dryMode
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
