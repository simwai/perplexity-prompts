<#
.SYNOPSIS
    Adapter generator for the Baba prompt system.
.DESCRIPTION
    Reads the portable prompt system (AGENTS.md + prompt-system/) and adapter
    templates (adapters/), then generates platform-specific adapter files for
    both OpenCode (.opencode/) and Claude Code (.claude/).

    This is the single source of truth for adapter generation. Both platforms
    are generated from the same portable system to prevent drift.

    Persona-driven files use templates with {{PLACEHOLDER}} tokens that are
    filled from prompt-system/personas.json. Adding a new persona = one entry
    in personas.json, and all router/command files update automatically.

    Run before sync.ps1 so generated adapters are included in the sync.
.EXAMPLE
    .\generate-adapters.ps1
#>

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = $scriptDir

function Write-Ok {
    param([string]$Message)
    Write-Host "OK  $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Warning $Message
}

# ═══════════════════════════════════════════════════════════════════════════
# 0. Load personas registry (single source of truth for persona enumeration)
# ═══════════════════════════════════════════════════════════════════════════

$personasPath = Join-Path $repoRoot 'prompt-system\personas.json'
$personas = @()

if (Test-Path -LiteralPath $personasPath -PathType Leaf) {
    $personasJson = Get-Content -LiteralPath $personasPath -Raw -Encoding UTF8
    try {
        $config = $personasJson | ConvertFrom-Json
        $personas = $config.personas
        Write-Ok "Loaded $($personas.Count) personas from registry"
    } catch {
        Write-Warn "Failed to parse personas.json: $_"
    }
} else {
    Write-Warn "personas.json not found at $personasPath"
}

# Build derived strings from the registry

# Persona routing lines for Claude plan.md
$personaRoutingClaude = @()
$personas | ForEach-Object {
    if ($_.routing.claudePlan) {
        $personaRoutingClaude += "- $($_.routing.claudePlan)"
    }
}

# Persona routing lines for OpenCode plan.md
$personaRoutingOpencode = @()
$personas | ForEach-Object {
    if ($_.routing.opencodePlan) {
        $personaRoutingOpencode += "- $($_.routing.opencodePlan)"
    }
}

# Build routing block for plan.md (claude + opencode share the same lines)
$personaRouting = $personaRoutingClaude + $personaRoutingOpencode | Select-Object -Unique

# Persona routing lines for build.md
$personaBuildRouting = @()
$personas | ForEach-Object {
    if ($_.routing.build) {
        $personaBuildRouting += "- $($_.routing.build)"
    }
}

# General comparison table rows
$personaGeneralTable = @()
$personaGeneralTable += '| Task type | Persona |'
$personaGeneralTable += '|-----------|---------|'
$personas | ForEach-Object {
    if ($_.routing.generalTable) {
        $parts = $_.routing.generalTable -split ' → ', 2
        $personaGeneralTable += "| $($parts[0].Trim()) | $($parts[1].Trim()) |"
    }
}
$personaGeneralTable = $personaGeneralTable -join "`n"

# Baba command keywords (from each persona's babaCommand.keywords, backtick-formatted)
$bt = [char]0x60  # backtick character
$keywordList = ($personas | ForEach-Object { $_.babaCommand.keywords[0] })
$babaCommandKeywords = ($keywordList | ForEach-Object { "$bt$_$bt" }) -join ', '

# Baba command instructions (one per persona)
$babaCommandInstructions = @()
$personas | ForEach-Object {
    $keyword = $_.babaCommand.keywords[0]
    $display = $_.display
    $instruction = $_.babaCommand.instruction
    $babaCommandInstructions += "- `$1` selects the persona: $bt$keyword$bt -> $display. $instruction"
}
$babaCommandInstructions = ($babaCommandInstructions -join "`n")

# ═══════════════════════════════════════════════════════════════════════════
# 1. Ensure target directories exist
# ═══════════════════════════════════════════════════════════════════════════

$targets = @{
    '.claude\agents'       = Join-Path $repoRoot '.claude\agents'
    '.claude\skills'       = Join-Path $repoRoot '.claude\skills'
    '.opencode\agents'     = Join-Path $repoRoot '.opencode\agents'
    '.opencode\commands'   = Join-Path $repoRoot '.opencode\commands'
}

foreach ($dir in $targets.Values) {
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# Helper: process a template file with placeholder substitution
# ═══════════════════════════════════════════════════════════════════════════

function Expand-Template {
    param(
        [string]$Content,
        [hashtable]$Tokens
    )
    foreach ($key in $Tokens.Keys) {
        $placeholder = "{{" + $key + "}}"
        $Content = $Content -replace [regex]::Escape($placeholder), $Tokens[$key]
    }
    return $Content
}

# ═══════════════════════════════════════════════════════════════════════════
# 2. Generate .claude/agents/ from adapters/claude/agents/ templates
#    - .md files are copied directly (persona agent files)
#    - .md.tmpl files are processed as templates
# ═══════════════════════════════════════════════════════════════════════════

$claudeAgentSrc = Join-Path $repoRoot 'adapters\claude\agents'
$claudeAgentDst = Join-Path $repoRoot '.claude\agents'

if (Test-Path -LiteralPath $claudeAgentSrc -PathType Container) {
    # Process template files
    $tmplFiles = Get-ChildItem -Path $claudeAgentSrc -Filter *.md.tmpl -File
    foreach ($file in $tmplFiles) {
        $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        $destName = $file.Name -replace '\.tmpl$', ''
        $dest = Join-Path $claudeAgentDst $destName

        $tokens = @{
            'PERSONA_ROUTING_CLAUDE' = ($personaRouting | Out-String).TrimEnd()
        }

        $expanded = Expand-Template -Content $content -Tokens $tokens
        $expanded | Set-Content -LiteralPath $dest -Encoding UTF8 -NoNewline
        # Ensure trailing newline
        Add-Content -LiteralPath $dest -Value "" -NoNewline
        Write-Ok "Generated $destName (template)"
    }

    # Copy regular .md files
    $files = Get-ChildItem -Path $claudeAgentSrc -Filter *.md -File
    foreach ($file in $files) {
        $dest = Join-Path $claudeAgentDst $file.Name
        Copy-Item -Path $file.FullName -Destination $dest -Force
    }
    $totalAgents = $files.Count + $tmplFiles.Count
    Write-Ok "Generated $totalAgents Claude Code agents"
} else {
    Write-Warn "Claude agent templates not found at $claudeAgentSrc"
}

# ═══════════════════════════════════════════════════════════════════════════
# 3. Generate .claude/skills/ from adapters/claude/skills/ templates
# ═══════════════════════════════════════════════════════════════════════════

$claudeSkillsSrc = Join-Path $repoRoot 'adapters\claude\skills'
$claudeSkillsDst = Join-Path $repoRoot '.claude\skills'

if (Test-Path -LiteralPath $claudeSkillsSrc -PathType Container) {
    $skillDirs = Get-ChildItem -Path $claudeSkillsSrc -Directory
    foreach ($dir in $skillDirs) {
        $srcFile = Join-Path $dir.FullName 'SKILL.md'
        if (Test-Path -LiteralPath $srcFile -PathType Leaf) {
            $destDir = Join-Path $claudeSkillsDst $dir.Name
            if (-not (Test-Path -LiteralPath $destDir -PathType Container)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            $destFile = Join-Path $destDir 'SKILL.md'
            Copy-Item -Path $srcFile -Destination $destFile -Force
        }
    }
    Write-Ok "Generated $($skillDirs.Count) Claude Code skills"
} else {
    Write-Warn "Claude skill templates not found at $claudeSkillsSrc"
}

# ═══════════════════════════════════════════════════════════════════════════
# 4. Generate .claude/settings.json from template
# ═══════════════════════════════════════════════════════════════════════════

$settingsTemplate = Join-Path $repoRoot 'adapters\claude\settings.json'
$settingsDest = Join-Path $repoRoot '.claude\settings.json'

if (Test-Path -LiteralPath $settingsTemplate -PathType Leaf) {
    Copy-Item -Path $settingsTemplate -Destination $settingsDest -Force
    Write-Ok "Generated .claude/settings.json"
} else {
    Write-Warn "Claude settings template not found at $settingsTemplate"
}

# ═══════════════════════════════════════════════════════════════════════════
# 5. Generate .mcp.json by translating opencode.jsonc mcp block
# ═══════════════════════════════════════════════════════════════════════════

$opencodeConfigPath = Join-Path $repoRoot 'opencode.jsonc'
$mcpJsonPath = Join-Path $repoRoot '.mcp.json'

if (Test-Path -LiteralPath $opencodeConfigPath -PathType Leaf) {
    $content = Get-Content -LiteralPath $opencodeConfigPath -Raw -Encoding UTF8
    # Strip comments (lines starting with //)
    $cleaned = ($content -split "`n" | Where-Object { $_.TrimStart() -notmatch '^//' }) -join "`n"
    
    try {
        $config = $cleaned | ConvertFrom-Json
        # Ordered, not a plain hashtable: hashtable enumeration is hash-seeded per
        # process, so a plain @{} emits the servers in a different order on every
        # run and leaves .mcp.json permanently dirty after a commit.
        $mcpServers = [ordered]@{}
        
        if ($config.mcp) {
            foreach ($server in $config.mcp.PSObject.Properties) {
                $name = $server.Name
                $val = $server.Value
                
                $mcpEntry = [ordered]@{}
                
                # Translate type
                switch ($val.type) {
                    'remote' { $mcpEntry.type = 'http' }
                    'local'  { $mcpEntry.type = 'stdio' }
                    default  { $mcpEntry.type = $val.type }
                }
                
                if ($mcpEntry.type -eq 'http') {
                    $mcpEntry.url = $val.url
                } elseif ($mcpEntry.type -eq 'stdio') {
                    if ($val.command -is [array]) {
                        $mcpEntry.command = $val.command[0]
                        $mcpEntry.args = @($val.command[1..($val.command.Length - 1)])
                    } else {
                        $mcpEntry.command = $val.command
                    }
                    if ($val.timeout) {
                        $mcpEntry.timeout = [int]$val.timeout
                    }
                }
                
                # Copy headers/env/oauth if present
                if ($val.headers) { $mcpEntry.headers = $val.headers }
                if ($val.env) { $mcpEntry.env = $val.env }
                if ($val.oauth) { $mcpEntry.oauth = $val.oauth }
                
                $mcpServers[$name] = $mcpEntry
            }
        }
        
        $mcpOutput = [ordered]@{ mcpServers = $mcpServers } | ConvertTo-Json -Depth 10
        $mcpOutput | Set-Content -LiteralPath $mcpJsonPath -Encoding UTF8 -Force
        Write-Ok "Generated .mcp.json ($($mcpServers.Count) servers)"
    } catch {
        Write-Warn "Failed to parse opencode.jsonc MCP block: $_"
    }
} else {
    Write-Warn "opencode.jsonc not found at $opencodeConfigPath"
}

# ═══════════════════════════════════════════════════════════════════════════
# 6. Generate .opencode/agents/ from adapters/opencode/agents/ templates
# ═══════════════════════════════════════════════════════════════════════════

$opencodeAgentSrc = Join-Path $repoRoot 'adapters\opencode\agents'
$opencodeAgentDst = Join-Path $repoRoot '.opencode\agents'

if (Test-Path -LiteralPath $opencodeAgentSrc -PathType Container) {
    # Process template files
    $tmplFiles = Get-ChildItem -Path $opencodeAgentSrc -Filter *.md.tmpl -File
    foreach ($file in $tmplFiles) {
        $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        $destName = $file.Name -replace '\.tmpl$', ''
        $dest = Join-Path $opencodeAgentDst $destName

        $tokens = @{}
        if ($destName -eq 'plan.md') {
            $tokens['PERSONA_ROUTING_OPENCODE'] = ($personaRouting | Out-String).TrimEnd()
        } elseif ($destName -eq 'build.md') {
            $tokens['PERSONA_BUILD_ROUTING'] = ($personaBuildRouting | Out-String).TrimEnd()
        } elseif ($destName -eq 'general.md') {
            $tokens['PERSONA_GENERAL_TABLE'] = $personaGeneralTable
        }

        if ($tokens.Count -gt 0) {
            $expanded = Expand-Template -Content $content -Tokens $tokens
        } else {
            $expanded = $content
        }
        $expanded | Set-Content -LiteralPath $dest -Encoding UTF8 -NoNewline
        Add-Content -LiteralPath $dest -Value "" -NoNewline
        Write-Ok "Generated $destName (template)"
    }

    # Copy regular .md files
    $files = Get-ChildItem -Path $opencodeAgentSrc -Filter *.md -File
    foreach ($file in $files) {
        $dest = Join-Path $opencodeAgentDst $file.Name
        Copy-Item -Path $file.FullName -Destination $dest -Force
    }
    $totalAgents = $files.Count + $tmplFiles.Count
    Write-Ok "Generated $totalAgents OpenCode agents"
} else {
    Write-Warn "OpenCode agent templates not found at $opencodeAgentSrc"
}

# ═══════════════════════════════════════════════════════════════════════════
# 7. Generate .opencode/commands/ from adapters/opencode/commands/ templates
# ═══════════════════════════════════════════════════════════════════════════

$opencodeCmdSrc = Join-Path $repoRoot 'adapters\opencode\commands'
$opencodeCmdDst = Join-Path $repoRoot '.opencode\commands'

if (Test-Path -LiteralPath $opencodeCmdSrc -PathType Container) {
    # Process template files
    $tmplFiles = Get-ChildItem -Path $opencodeCmdSrc -Filter *.md.tmpl -File
    foreach ($file in $tmplFiles) {
        $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        $destName = $file.Name -replace '\.tmpl$', ''
        $dest = Join-Path $opencodeCmdDst $destName

        $tokens = @{}
        if ($destName -eq 'baba.md') {
            $tokens['BABA_COMMAND_KEYWORDS'] = $babaCommandKeywords
            $tokens['BABA_COMMAND_INSTRUCTIONS'] = $babaCommandInstructions
        }

        if ($tokens.Count -gt 0) {
            $expanded = Expand-Template -Content $content -Tokens $tokens
        } else {
            $expanded = $content
        }
        $expanded | Set-Content -LiteralPath $dest -Encoding UTF8 -NoNewline
        Add-Content -LiteralPath $dest -Value "" -NoNewline
        Write-Ok "Generated $destName (template)"
    }

    # Copy regular .md files
    $files = Get-ChildItem -Path $opencodeCmdSrc -Filter *.md -File
    foreach ($file in $files) {
        $dest = Join-Path $opencodeCmdDst $file.Name
        Copy-Item -Path $file.FullName -Destination $dest -Force
    }
    $totalCommands = $files.Count + $tmplFiles.Count
    Write-Ok "Generated $totalCommands OpenCode commands"
} else {
    Write-Warn "OpenCode command templates not found at $opencodeCmdSrc"
}

# ═══════════════════════════════════════════════════════════════════════════
# 8. Summary
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "Adapter generation complete." -ForegroundColor Cyan
Write-Host "Generated files:" -ForegroundColor Gray
Write-Host "  .claude/agents/    - Claude Code subagent definitions" -ForegroundColor Gray
Write-Host "  .claude/skills/    - Claude Code slash commands as skills" -ForegroundColor Gray
Write-Host "  .claude/settings.json - Project-scoped settings" -ForegroundColor Gray
Write-Host "  .mcp.json          - MCP server configuration" -ForegroundColor Gray
Write-Host "  .opencode/agents/  - OpenCode agent definitions" -ForegroundColor Gray
Write-Host "  .opencode/commands/- OpenCode slash commands" -ForegroundColor Gray
Write-Host ""
Write-Host "Persona-driven files generated from: prompt-system/personas.json" -ForegroundColor Gray
Write-Host "  Personas: $($personas.Count)" -ForegroundColor Gray
