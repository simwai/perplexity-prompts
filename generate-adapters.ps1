<#
.SYNOPSIS
    Adapter generator for the Baba prompt system.
.DESCRIPTION
    Reads the portable prompt system (AGENTS.md + prompt-system/) and adapter
    templates (adapters/), then generates platform-specific adapter files for
    OpenCode (.opencode/), Claude Code (.claude/), and Kilo Code (.kilo/).

    This is the single source of truth for adapter generation. All platforms
    are generated from the same portable system to prevent drift.

    Persona-driven files use templates with {{PLACEHOLDER}} tokens that are
    filled from prompt-system/personas.json. Adding a new persona = one entry
    in personas.json, and all router/command files update automatically.

    Kilo Code agents and commands are GENERATED from their OpenCode
    counterparts (identical body content, transformed frontmatter), so only
    one template set needs maintenance. Kilo skills are explicit templates
    because they mirror the Claude Code skill set.

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
    '.kilo\agent'          = Join-Path $repoRoot '.kilo\agent'
    '.kilo\command'        = Join-Path $repoRoot '.kilo\command'
    '.kilo\skills'         = Join-Path $repoRoot '.kilo\skills'
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
# 8. Generate .kilo/agent/ from adapters/opencode/agents/ (transform frontmatter)
#    Kilo Code uses the same agent body content as OpenCode; only the
#    frontmatter differs: + color, - skill/task permission keys.
#    Color comes from personas.json (single source of truth).
# ═══════════════════════════════════════════════════════════════════════════

$opencodeAgentSrc = Join-Path $repoRoot 'adapters\opencode\agents'
$kiloAgentDst = Join-Path $repoRoot '.kilo\agent'

if (Test-Path -LiteralPath $opencodeAgentSrc -PathType Container) {
    if (-not (Test-Path -LiteralPath $kiloAgentDst -PathType Container)) {
        New-Item -ItemType Directory -Path $kiloAgentDst -Force | Out-Null
    }

    $files = Get-ChildItem -Path $opencodeAgentSrc -Filter *.md -File
    $tmplFiles = Get-ChildItem -Path $opencodeAgentSrc -Filter *.md.tmpl -File
    $allFiles = @($files) + @($tmplFiles)

    foreach ($file in $allFiles) {
        $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        $destName = $file.Name -replace '\.tmpl$', ''
        $dest = Join-Path $kiloAgentDst $destName

        # Split frontmatter and body. `---` delimiters are anchored to line
        # ends without consuming the blank line that follows the closing
        # delimiter, so the body keeps its original spacing.
        if ($content -match '(?s)^---\r?\n(.*?)\r?\n---\r?\n(.*)$') {
            $frontmatter = $matches[1]
            $body = $matches[2]
        } else {
            $frontmatter = ''
            $body = $content
        }

        # Transform frontmatter for Kilo Code
        $newFrontmatter = $frontmatter
        # Drop skill/task permission keys (not Kilo permission categories)
        $newFrontmatter = $newFrontmatter -replace '(?m)^\s*skill:\s*.*(\r?\n)?$', ''
        $newFrontmatter = $newFrontmatter -replace '(?m)^\s*task:\s*.*(\r?\n)?$', ''

        # Look up color from personas.json (default: explore blue)
        $personaId = $destName -replace '\.md$', ''
        $color = '#89b4fa'
        $persona = $personas | Where-Object { $_.id -eq $personaId }
        if ($persona -and $persona.kilo -and $persona.kilo.color) {
            $color = $persona.kilo.color
        }
        # Insert color after temperature (or after mode when no temperature)
        if ($newFrontmatter -match '(?m)^(temperature:\s*.*)$') {
            $newFrontmatter = $newFrontmatter -replace '(?m)^(temperature:\s*.*)$', "`$1`ncolor: `"$color`""
        } elseif ($newFrontmatter -match '(?m)^(mode:\s*.*)$') {
            $newFrontmatter = $newFrontmatter -replace '(?m)^(mode:\s*.*)$', "`$1`ncolor: `"$color`""
        }

        # Collapse leftover blank lines inside the frontmatter block
        $newFrontmatter = ($newFrontmatter -split "\r?\n" | Where-Object { $_.Trim() -ne '' }) -join "`n"

        # Reassemble (body already carries its own leading newline)
        if ($newFrontmatter) {
            $expanded = "---`n$newFrontmatter`n---`n$body"
        } else {
            $expanded = $body
        }

        # Template token substitution (plan/build/general router agents)
        $tokens = @{}
        if ($destName -eq 'plan.md') {
            $tokens['PERSONA_ROUTING'] = ($personaRouting | Out-String).TrimEnd()
        } elseif ($destName -eq 'build.md') {
            $tokens['PERSONA_BUILD_ROUTING'] = ($personaBuildRouting | Out-String).TrimEnd()
        } elseif ($destName -eq 'general.md') {
            $tokens['PERSONA_GENERAL_TABLE'] = $personaGeneralTable
        }
        foreach ($key in $tokens.Keys) {
            $placeholder = "{{" + $key + "}}"
            $expanded = $expanded -replace [regex]::Escape($placeholder), $tokens[$key]
        }

        $expanded | Set-Content -LiteralPath $dest -Encoding UTF8 -NoNewline
        Add-Content -LiteralPath $dest -Value "" -NoNewline
        Write-Ok "Generated $destName (from OpenCode)"
    }
    Write-Ok "Generated $($allFiles.Count) Kilo Code agents"
} else {
    Write-Warn "OpenCode agent templates not found at $opencodeAgentSrc"
}

# ═══════════════════════════════════════════════════════════════════════════
# 9. Generate .kilo/command/ from adapters/opencode/commands/ (transform frontmatter)
#    Kilo Code commands use the same body content as OpenCode; only the
#    frontmatter differs: + agent/subtask, - argument-hint.
# ═══════════════════════════════════════════════════════════════════════════

$opencodeCmdSrc = Join-Path $repoRoot 'adapters\opencode\commands'
$kiloCmdDst = Join-Path $repoRoot '.kilo\command'

if (Test-Path -LiteralPath $opencodeCmdSrc -PathType Container) {
    if (-not (Test-Path -LiteralPath $kiloCmdDst -PathType Container)) {
        New-Item -ItemType Directory -Path $kiloCmdDst -Force | Out-Null
    }

    $files = Get-ChildItem -Path $opencodeCmdSrc -Filter *.md -File
    $tmplFiles = Get-ChildItem -Path $opencodeCmdSrc -Filter *.md.tmpl -File
    $allFiles = @($files) + @($tmplFiles)

    foreach ($file in $allFiles) {
        $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        $destName = $file.Name -replace '\.tmpl$', ''
        $dest = Join-Path $kiloCmdDst $destName

        # Split frontmatter and body (body keeps its own leading newline)
        if ($content -match '(?s)^---\r?\n(.*?)\r?\n---\r?\n(.*)$') {
            $frontmatter = $matches[1]
            $body = $matches[2]
        } else {
            $frontmatter = ''
            $body = $content
        }

        # Transform frontmatter for Kilo Code.
        # Drop argument-hint and any existing agent line; the agent is
        # re-injected once so commands that already declare `agent` (e.g.
        # verify.md routes to Build) do not end up with a duplicate key.
        $newFrontmatter = $frontmatter
        $newFrontmatter = $newFrontmatter -replace '(?m)^\s*argument-hint:\s*.*(\r?\n)?$', ''
        $existingAgent = ''
        if ($newFrontmatter -match '(?m)^\s*agent:\s*(\S*)\s*$') {
            $existingAgent = $matches[1]
        }
        $newFrontmatter = $newFrontmatter -replace '(?m)^\s*agent:\s*.*(\r?\n)?$', ''

        $agentName = 'code'
        if ($existingAgent) { $agentName = $existingAgent }

        # Collapse blank lines, then inject agent/subtask after description
        $lines = $newFrontmatter -split "\r?\n" | Where-Object { $_.Trim() -ne '' }
        $rebuilt = @()
        foreach ($line in $lines) {
            $rebuilt += $line
            if ($line -match '(?m)^description:') {
                $rebuilt += "agent: $agentName"
                $rebuilt += 'subtask: true'
            }
        }
        $newFrontmatter = $rebuilt -join "`n"

        # Reassemble (body already carries its own leading newline)
        if ($newFrontmatter) {
            $expanded = "---`n$newFrontmatter`n---`n$body"
        } else {
            $expanded = "---`nagent: code`nsubtask: true`n---`n$body"
        }

        # Template token substitution (baba command)
        $tokens = @{}
        if ($destName -eq 'baba.md') {
            $tokens['BABA_COMMAND_KEYWORDS'] = $babaCommandKeywords
            $tokens['BABA_COMMAND_INSTRUCTIONS'] = $babaCommandInstructions
        }
        foreach ($key in $tokens.Keys) {
            $placeholder = "{{" + $key + "}}"
            $expanded = $expanded -replace [regex]::Escape($placeholder), $tokens[$key]
        }

        $expanded | Set-Content -LiteralPath $dest -Encoding UTF8 -NoNewline
        Add-Content -LiteralPath $dest -Value "" -NoNewline
        Write-Ok "Generated $destName (from OpenCode)"
    }
    Write-Ok "Generated $($allFiles.Count) Kilo Code commands"
} else {
    Write-Warn "OpenCode command templates not found at $opencodeCmdSrc"
}

# ═══════════════════════════════════════════════════════════════════════════
# 10. Generate .kilo/skills/ from adapters/kilo/skills/ templates
#     Skills are explicit templates (they mirror the Claude Code skill set,
#     which is the single source for skill content).
# ═══════════════════════════════════════════════════════════════════════════

$kiloSkillsSrc = Join-Path $repoRoot 'adapters\kilo\skills'
$kiloSkillsDst = Join-Path $repoRoot '.kilo\skills'

if (Test-Path -LiteralPath $kiloSkillsSrc -PathType Container) {
    $skillDirs = Get-ChildItem -Path $kiloSkillsSrc -Directory
    foreach ($dir in $skillDirs) {
        $srcFile = Join-Path $dir.FullName 'SKILL.md'
        if (Test-Path -LiteralPath $srcFile -PathType Leaf) {
            $destDir = Join-Path $kiloSkillsDst $dir.Name
            if (-not (Test-Path -LiteralPath $destDir -PathType Container)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            $destFile = Join-Path $destDir 'SKILL.md'
            Copy-Item -Path $srcFile -Destination $destFile -Force
        }
    }
    Write-Ok "Generated $($skillDirs.Count) Kilo Code skills"
} else {
    Write-Warn "Kilo Code skill templates not found at $kiloSkillsSrc"
}

# ═══════════════════════════════════════════════════════════════════════════
# 11. Generate kilo.json from opencode.jsonc
# ═══════════════════════════════════════════════════════════════════════════

$kiloJsonPath = Join-Path $repoRoot 'kilo.json'

if (Test-Path -LiteralPath $opencodeConfigPath -PathType Leaf) {
    $content = Get-Content -LiteralPath $opencodeConfigPath -Raw -Encoding UTF8
    # Strip comments (lines starting with //)
    $cleaned = ($content -split "`n" | Where-Object { $_.TrimStart() -notmatch '^//' }) -join "`n"
    
    try {
        $config = $cleaned | ConvertFrom-Json
        
        $kiloConfig = [ordered]@{}
        
        # Kilo Code schema (NOT the OpenCode schema -- the generated config is
        # consumed by Kilo Code, which validates against its own schema URL)
        $kiloConfig['$schema'] = 'https://app.kilo.ai/config.json'
        
        # Extract fields needed by Kilo Code (same as OpenCode)
        if ($config.instructions) { $kiloConfig.instructions = $config.instructions }
        if ($config.default_agent) { $kiloConfig.default_agent = $config.default_agent }
        if ($config.small_model) { $kiloConfig.small_model = $config.small_model }
        if ($config.permission) { $kiloConfig.permission = $config.permission }
        if ($config.model) { $kiloConfig.model = $config.model }
        
        # MCP block - Kilo Code uses the same format as OpenCode (local/remote)
        if ($config.mcp) {
            $mcpServers = [ordered]@{}
            foreach ($server in $config.mcp.PSObject.Properties) {
                $name = $server.Name
                $val = $server.Value
                
                $mcpEntry = [ordered]@{}
                
                # Keep OpenCode format (local/remote) for Kilo Code
                $mcpEntry.type = $val.type
                
                if ($mcpEntry.type -eq 'remote') {
                    $mcpEntry.url = $val.url
                } elseif ($mcpEntry.type -eq 'local') {
                    if ($val.command -is [array]) {
                        $mcpEntry.command = $val.command
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
            $kiloConfig.mcp = $mcpServers
        }
        
        $kiloOutput = $kiloConfig | ConvertTo-Json -Depth 10
        $kiloOutput | Set-Content -LiteralPath $kiloJsonPath -Encoding UTF8 -Force
        Write-Ok "Generated kilo.json ($($kiloConfig.Count) top-level keys, $($mcpServers.Count) MCP servers)"
    } catch {
        Write-Warn "Failed to parse opencode.jsonc for kilo.json generation: $_"
    }
} else {
    Write-Warn "opencode.jsonc not found at $opencodeConfigPath for kilo.json generation"
}

# ═══════════════════════════════════════════════════════════════════════════
# 12. Summary
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
Write-Host "  .kilo/agent/       - Kilo Code agents (generated from OpenCode + personas.json)" -ForegroundColor Gray
Write-Host "  .kilo/command/     - Kilo Code commands (generated from OpenCode)" -ForegroundColor Gray
Write-Host "  .kilo/skills/      - Kilo Code skills (explicit templates)" -ForegroundColor Gray
Write-Host "  kilo.json          - Kilo Code configuration (generated from opencode.jsonc)" -ForegroundColor Gray
Write-Host ""
Write-Host "Persona-driven files generated from: prompt-system/personas.json" -ForegroundColor Gray
Write-Host "  Personas: $($personas.Count)" -ForegroundColor Gray
