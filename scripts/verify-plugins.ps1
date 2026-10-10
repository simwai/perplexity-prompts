<#
.SYNOPSIS
    Verifies that every opencode plugin is actually discoverable and loadable.

.DESCRIPTION
    opencode reports plugin failures to a log file nobody reads, and one of its
    failure stages is completely silent. This script re-derives the loader's own
    rules and checks this repo against them, so a broken plugin surfaces as a
    failed check here instead of a mystery in the UI.

    The rules encoded here come from packages/opencode/src/config/plugin.ts and
    packages/opencode/src/plugin/shared.ts at the v1.18.34 tag:

      - Discovery is Glob.scan("{plugin,plugins}/*.{ts,js}") -- files only,
        non-recursive. Subdirectories are never auto-discovered.
      - isPathPluginSpec() treats an entry as a path only when it starts with
        file://, "./", "../" or is absolute. Everything else is an npm
        specifier that goes through the package installer.
      - deduplicatePluginOrigins() keys on the exact file:// URL, so the same
        plugin basename under two different config roots loads twice.

.EXAMPLE
    pwsh -File scripts/verify-plugins.ps1
#>

[CmdletBinding()]
param()

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

# opencode.jsonc is JSON with comments, which ConvertFrom-Json cannot parse.
# Strip line comments first, skipping the "//" that belongs to a URL scheme.
function Read-Jsonc {
    param([string]$Path)
    $text = Get-Content -Raw -LiteralPath $Path
    $stripped = $text -replace '(?m)(^|[^:])(//).*$', '$1'
    return $stripped | ConvertFrom-Json
}

function Test-PathPluginSpec {
    param([string]$Spec)
    # Mirrors isPathPluginSpec() in plugin/shared.ts, which tests startsWith(".")
    # -- not startsWith("./"). So ".opencode/plugins/x.ts" is a valid path entry.
    return $Spec.StartsWith(".") -or
           $Spec.StartsWith("file://") -or
           [System.IO.Path]::IsPathRooted($Spec)
}

# ---------------------------------------------------------------------------
Write-Section "1. CLI version vs pinned @opencode-ai/plugin"

$cliVersion = (& opencode --version 2>$null | Select-Object -First 1)
if (-not $cliVersion) {
    Add-Failure "could not determine the opencode CLI version (is it on PATH?)"
    $cliVersion = "unknown"
} else {
    Write-Host "  CLI version: $cliVersion"
}

$sdkRoots = @(
    (Join-Path $repoRoot ".opencode"),
    (Join-Path $env:USERPROFILE ".config\opencode"),
    (Join-Path $env:USERPROFILE ".opencode")
)

foreach ($root in $sdkRoots) {
    $manifest = Join-Path $root "package.json"
    if (-not (Test-Path -LiteralPath $manifest)) { continue }
    $pinned = $null
    try {
        $pinned = (Get-Content -Raw -LiteralPath $manifest | ConvertFrom-Json).dependencies."@opencode-ai/plugin"
    } catch {
        Add-Failure "$manifest could not be parsed as JSON"
        continue
    }
    if (-not $pinned) { continue }
    if ($cliVersion -ne "unknown" -and $pinned -ne $cliVersion) {
        Add-Failure "$root pins @opencode-ai/plugin@$pinned but the CLI is $cliVersion"
    } else {
        Write-Host "  ok    $root pins $pinned"
    }
}

# ---------------------------------------------------------------------------
Write-Section "2. Every plugin entry resolves"

$configs = @(
    (Join-Path $repoRoot "opencode.jsonc"),
    (Join-Path $env:USERPROFILE ".config\opencode\opencode.jsonc")
)

foreach ($configPath in $configs) {
    if (-not (Test-Path -LiteralPath $configPath)) {
        Write-Host "  skip  $configPath (not present)"
        continue
    }
    try {
        $config = Read-Jsonc -Path $configPath
    } catch {
        Add-Failure "$configPath could not be parsed"
        continue
    }

    $entries = @($config.plugin)
    if ($entries.Count -eq 0) {
        Write-Host "  ok    $configPath declares no plugin entries"
        continue
    }

    $configDir = Split-Path -Parent $configPath
    foreach ($entry in $entries) {
        $spec = if ($entry -is [array]) { $entry[0] } else { $entry }

        if (Test-PathPluginSpec -Spec $spec) {
            # Relative specs are resolved against the directory of the config
            # file that declared them, not against the process working directory.
            $relative = $spec -replace '^file://', ''
            if ($relative -notmatch '^[\\/]') {
                $relative = Join-Path $configDir $relative
            }
            if (Test-Path -LiteralPath $relative) {
                Write-Host "  ok    $spec -> $relative"
            } else {
                Add-Failure "$configPath declares '$spec' which does not exist at $relative"
            }
            continue
        }

        # A bare name is an npm specifier. Confirm the package actually resolves,
        # because an unresolvable one fails silently at the install stage.
        $pkg, $version = $spec, "latest"
        $at = $spec.LastIndexOf("@")
        if ($at -gt 0) {
            $pkg = $spec.Substring(0, $at)
            $version = $spec.Substring($at + 1)
        }
        if ($version -eq "latest" -or $version -eq "") {
            $resolved = (& npm view $pkg version --silent 2>$null | Select-Object -Last 1)
        } else {
            $resolved = (& npm view "$pkg@$version" version --silent 2>$null | Select-Object -Last 1)
        }
        if ($resolved) {
            Write-Host "  ok    $spec -> npm $pkg@$resolved"
        } else {
            Add-Failure "$configPath declares '$spec' but npm cannot resolve package '$pkg'"
        }
    }
}

# ---------------------------------------------------------------------------
Write-Section "3. Auto-discovered plugin directory is clean"

$pluginDirs = @(
    (Join-Path $repoRoot ".opencode\plugins"),
    (Join-Path $env:USERPROFILE ".config\opencode\plugins")
)

foreach ($dir in $pluginDirs) {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    $files = @(Get-ChildItem -LiteralPath $dir -File |
        Where-Object { $_.Extension -in ".ts", ".js" })
    Write-Host "  $($files.Count) loadable file(s) in $dir"

    # A *.test.ts matches the discovery glob, so opencode imports it as a plugin.
    foreach ($stray in @($files | Where-Object { $_.Name -match '\.(test|spec)\.' })) {
        Add-Failure "$($stray.FullName) sits in a directory opencode auto-scans and will be imported as a plugin"
    }

    # Subdirectories are never auto-discovered. That is only safe when the
    # directory is reachable through an explicit path entry or a sibling shim.
    foreach ($sub in @(Get-ChildItem -LiteralPath $dir -Directory)) {
        # Scratch and test directories are intentionally inert; they exist so the
        # discovery glob cannot reach them.
        if ($sub.Name -match '^(__|\.)' -or $sub.Name -match '(test|spec)') { continue }

        $hasIndex = @("index.ts", "index.tsx", "index.js", "index.mjs", "index.cjs") |
            Where-Object { Test-Path -LiteralPath (Join-Path $sub.FullName $_) }
        $hasManifest = Test-Path -LiteralPath (Join-Path $sub.FullName "package.json")
        $hasShim = (Test-Path -LiteralPath (Join-Path $dir ($sub.Name + ".ts"))) -or
                   (Test-Path -LiteralPath (Join-Path $dir ($sub.Name + ".js")))

        if (-not ($hasIndex -or $hasManifest) -and -not $hasShim) {
            Add-Failure "$($sub.Name) is a directory with no index file and no sibling shim, so nothing loads it"
        }
    }
}

# ---------------------------------------------------------------------------
Write-Section "4. No plugin basename is loaded from two config roots"

$basenames = @{}
foreach ($dir in $pluginDirs) {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    foreach ($file in @(Get-ChildItem -LiteralPath $dir -File |
        Where-Object { $_.Extension -in ".ts", ".js" })) {
        if (-not $basenames.ContainsKey($file.Name)) {
            $basenames[$file.Name] = @()
        }
        $basenames[$file.Name] += $file.FullName
    }
}

foreach ($name in $basenames.Keys) {
    $paths = $basenames[$name]
    if ($paths.Count -gt 1) {
        # Dedup keys on the absolute file URL, so two roots means two loads.
        Add-Failure "'$name' exists under $($paths.Count) roots and will load $($paths.Count) times: $($paths -join ', ')"
    }
}

# ---------------------------------------------------------------------------
Write-Section "5. Recent loader errors in the opencode log"

$logPath = Join-Path $env:USERPROFILE ".local\share\opencode\log\opencode.log"
if (-not (Test-Path -LiteralPath $logPath)) {
    Write-Host "  skip  log not found at $logPath"
} else {
    $patterns = "failed to load plugin", "Failed to install plugin",
                "Plugin .* skipped", "is not a function",
                "plugin config hook failed", "plugin dispose hook failed"
    $hits = @(Get-Content -LiteralPath $logPath -Tail 2000 |
        Select-String -Pattern $patterns)

    # The log is shared by every project on this machine. Only failures whose
    # path points at this checkout are hard failures; the rest are reported so a
    # broken shared plugin is still visible.
    $mine, $others = @(), @()
    foreach ($hit in $hits) {
        # A logged bash command can itself contain these strings, so ignore
        # permission-evaluation lines before classifying anything.
        if ($hit.Line -like "*evaluated permission=*") { continue }
        if ($hit.Line -like "*$repoRoot*") { $mine += $hit.Line }
        else { $others += $hit.Line }
    }

    foreach ($line in @($mine | Sort-Object -Unique)) { Add-Failure "log: $line" }
    foreach ($line in @($others | Sort-Object -Unique)) {
        Write-Host "  note  other project: $line" -ForegroundColor Yellow
    }
    if ($mine.Count -eq 0) {
        Write-Host "  ok    no plugin loader errors for this repo in the last 2000 log lines"
    }
}

# ---------------------------------------------------------------------------
Write-Host ""
if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) problem(s) found." -ForegroundColor Red
    exit 1
}
Write-Host "PASSED: no plugin loading problems detected." -ForegroundColor Green
exit 0
