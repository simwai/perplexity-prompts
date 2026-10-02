<#
.SYNOPSIS
    Adapter generator for the Baba prompt system.
.DESCRIPTION
    Reads the portable prompt system (AGENTS.md + prompt-system/) and adapter
    templates (adapters/), then generates platform-specific adapter files for
    both OpenCode (.opencode/) and Claude Code (.claude/).
    
    This is the single source of truth for adapter generation. Both platforms
    are generated from the same portable system to prevent drift.
    
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
# 2. Generate .claude/agents/ from adapters/claude/agents/ templates
# ═══════════════════════════════════════════════════════════════════════════

$claudeAgentSrc = Join-Path $repoRoot 'adapters\claude\agents'
$claudeAgentDst = Join-Path $repoRoot '.claude\agents'

if (Test-Path -LiteralPath $claudeAgentSrc -PathType Container) {
    $files = Get-ChildItem -Path $claudeAgentSrc -Filter *.md -File
    foreach ($file in $files) {
        $dest = Join-Path $claudeAgentDst $file.Name
        Copy-Item -Path $file.FullName -Destination $dest -Force
    }
    Write-Ok "Generated $($files.Count) Claude Code agents"
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
        $mcpServers = @{}
        
        if ($config.mcp) {
            foreach ($server in $config.mcp.PSObject.Properties) {
                $name = $server.Name
                $val = $server.Value
                
                $mcpEntry = @{}
                
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
        
        $mcpOutput = @{ mcpServers = $mcpServers } | ConvertTo-Json -Depth 10
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
    $files = Get-ChildItem -Path $opencodeAgentSrc -Filter *.md -File
    foreach ($file in $files) {
        $dest = Join-Path $opencodeAgentDst $file.Name
        Copy-Item -Path $file.FullName -Destination $dest -Force
    }
    Write-Ok "Generated $($files.Count) OpenCode agents"
} else {
    Write-Warn "OpenCode agent templates not found at $opencodeAgentSrc"
}

# ═══════════════════════════════════════════════════════════════════════════
# 7. Generate .opencode/commands/ from adapters/opencode/commands/ templates
# ═══════════════════════════════════════════════════════════════════════════

$opencodeCmdSrc = Join-Path $repoRoot 'adapters\opencode\commands'
$opencodeCmdDst = Join-Path $repoRoot '.opencode\commands'

if (Test-Path -LiteralPath $opencodeCmdSrc -PathType Container) {
    $files = Get-ChildItem -Path $opencodeCmdSrc -Filter *.md -File
    foreach ($file in $files) {
        $dest = Join-Path $opencodeCmdDst $file.Name
        Copy-Item -Path $file.FullName -Destination $dest -Force
    }
    Write-Ok "Generated $($files.Count) OpenCode commands"
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
