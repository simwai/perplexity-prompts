# test-kilo-command-agents.ps1
# Asserts that every generated Kilo command routes to a subagent Kilo can
# actually spawn.
#
# /smoke failed on first invocation with "primary agent, not a subagent":
# generate-adapters.ps1 injected `agent: code` -- an OpenCode primary agent
# MODE -- together with `subtask: true`, and modes are not spawnable. 33 of 43
# commands shipped with the same defect (/verify, /build, /plan included).
# This suite makes that class of drift a commit failure instead of a runtime
# surprise.
#
# Checks:
#   1. Every .kilo\command\*.md has an `agent:` naming a registered subagent
#      (allowlist below, mirror of the generator's).
#   2. Every command carries `subtask: true` so it runs as a spawnable subtask.
#   3. Every allowlisted name has a matching .kilo\agent\<name>.md -- an
#      allowlist that outruns the agent directory is drift in the other
#      direction.
#
# Scope: the generated .kilo\ surface only. Exit 0 on pass, non-zero on fail.

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\test-assertions.ps1"

$systemRoot = Join-Path $PSScriptRoot '..'
$repoRoot = (Resolve-Path (Join-Path $systemRoot '..')).Path

# Registered Kilo subagents: mirror of $kiloSubagents in generate-adapters.ps1.
# A newly registered agent is added in BOTH places or one of the two gates
# (this suite, the generator's abort on unknown names) goes blind.
$kiloSubagents = @(
    'baba-ceo', 'baba-designer', 'baba-dev', 'baba-reviewer',
    'baba-scrum', 'baba-sensei', 'baba-tester', 'ultra-pro-quant',
    'explore', 'general'
)

# Primary agent MODES are not subagents. Any of these in an `agent:` line is
# exactly the defect this suite exists to catch.
$primaryModes = @('code', 'build', 'plan', 'ask')

$commandDir = Join-Path $repoRoot '.kilo\command'
Assert-FileExists -Path (Join-Path $commandDir 'smoke.md') -Description 'smoke command (sanity anchor for the suite scope)'

if (Test-Path -LiteralPath $commandDir -PathType Container) {
    $commands = Get-ChildItem -Path $commandDir -Filter '*.md' -File
    if ($commands.Count -eq 0) {
        Add-TestFailure "EMPTY: no commands found in $commandDir"
    }
    foreach ($cmd in $commands) {
        $content = [System.IO.File]::ReadAllText($cmd.FullName)

        if ($content -notmatch '(?m)^subtask:\s*true\s*$') {
            Add-TestFailure "SUBTASK: $($cmd.Name) has no 'subtask: true' -- the command cannot run as a spawnable subtask"
        }

        if ($content -match '(?m)^agent:\s*(\S+)\s*$') {
            $agent = $Matches[1]
            if ($primaryModes -contains $agent) {
                Add-TestFailure "PRIMARY AGENT: $($cmd.Name) routes to '$agent', a primary mode, not a spawnable subagent"
            } elseif ($kiloSubagents -notcontains $agent) {
                Add-TestFailure "UNREGISTERED AGENT: $($cmd.Name) routes to '$agent', which is not in the registered-subagent allowlist"
            }
        } else {
            Add-TestFailure "NO AGENT: $($cmd.Name) has no 'agent:' line in its frontmatter"
        }
    }
    Write-Host "  checked $($commands.Count) Kilo command files"

    # Reverse check: generation is write-only, so a command whose source
    # template was removed from adapters\opencode\commands survives forever as
    # an unmaintainable orphan -- exactly how diagnose.md carried the
    # agent: code defect after its template was gone. Every generated command
    # must have a live source template.
    $sourceDir = Join-Path $repoRoot 'adapters\opencode\commands'
    if (Test-Path -LiteralPath $sourceDir -PathType Container) {
        $sourceNames = @(Get-ChildItem -LiteralPath $sourceDir -Filter '*.md' -File | ForEach-Object { $_.Name })
        $sourceNames += @(Get-ChildItem -LiteralPath $sourceDir -Filter '*.md.tmpl' -File | ForEach-Object { $_.Name -replace '\.tmpl$', '' })
        foreach ($cmd in $commands) {
            if ($sourceNames -notcontains $cmd.Name) {
                Add-TestFailure "ORPHAN COMMAND: .kilo\command\$($cmd.Name) has no source template in adapters\opencode\commands -- generation cannot maintain it; delete it or restore the source"
            }
        }
        Write-Host "  orphan check passed ($($commands.Count) generated vs $($sourceNames.Count) source templates)"
    } else {
        Write-Warning "adapters\opencode\commands not found ($sourceDir) -- orphan check SKIPPED"
    }
} else {
    Add-TestFailure "MISSING: .kilo\command directory does not exist ($commandDir)"
}

$agentDir = Join-Path $repoRoot '.kilo\agent'
# Kilo registers `general` itself as a built-in; the on-disk general.md is a
# persona routing table shared with OpenCode's built-in (its source,
# adapters\opencode\agents\general.md.tmpl, is a 3-line routing table with no
# frontmatter), not a registration file. Spawnability for `general` therefore
# rests on Kilo's built-in registry, which this suite cannot read; the
# exemption documents that boundary rather than hiding it. Every other
# allowlisted name must declare `mode: subagent` in its definition file,
# otherwise the name is a routing fiction and commands pointed at it fail the
# exact "primary agent, not a subagent" way this suite exists to catch.
$builtInSubagents = @('general')
foreach ($name in $kiloSubagents) {
    $agentFile = Join-Path $agentDir "$name.md"
    if (-not (Test-Path -LiteralPath $agentFile -PathType Leaf)) {
        Add-TestFailure "ALLOWLIST DRIFT: '$name' is allowlisted but .kilo\agent\$name.md does not exist"
        continue
    }
    if ($builtInSubagents -contains $name) { continue }
    $agentText = [System.IO.File]::ReadAllText($agentFile)
    if ($agentText -notmatch '(?m)^mode:\s*subagent\s*$') {
        Add-TestFailure "UNREGISTERED AGENT DEF: .kilo\agent\$name.md has no 'mode: subagent' line, so '$name' is not a spawnable subagent; add the frontmatter or exempt it in `$builtInSubagents with a comment"
    }
}
Write-Host "  verified $($kiloSubagents.Count) allowlisted agents have spawnable definitions (built-in: $($builtInSubagents -join ', '))"

# The generator owns the allowlist; this suite mirrors it. A newly registered
# agent must be added in both places or one of the two gates goes blind, so
# compare the two arrays token-for-token and fail on divergence.
$generatorPath = Join-Path $repoRoot 'generate-adapters.ps1'
if (Test-Path -LiteralPath $generatorPath -PathType Leaf) {
    $generatorText = [System.IO.File]::ReadAllText($generatorPath)
    if ($generatorText -match '(?s)\$kiloSubagents\s*=\s*@\((.+?)\)') {
        $generatorNames = @([regex]::Matches($Matches[1], "'([^']+)'") | ForEach-Object { $_.Groups[1].Value } | Sort-Object)
        $suiteNames = @($kiloSubagents | Sort-Object)
        $diff = @(Compare-Object -ReferenceObject $suiteNames -DifferenceObject $generatorNames)
        if ($diff.Count -gt 0) {
            $legend = '<= in this suite only, => in generate-adapters.ps1 only'
            $detail = ($diff | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }) -join '; '
            Add-TestFailure "ALLOWLIST DRIFT: generate-adapters.ps1 and this suite disagree on registered subagents ($legend): $detail"
        } else {
            Write-Host "  allowlist matches generate-adapters.ps1 ($($generatorNames.Count) names)"
        }
    } else {
        Add-TestFailure "ALLOWLIST DRIFT: generate-adapters.ps1 defines no parseable `$kiloSubagents array; this suite's allowlist has gone stale"
    }
} else {
    Write-Warning "generate-adapters.ps1 not found at repo root ($generatorPath) -- allowlist check SKIPPED"
}

exit (Complete-TestRun -SuiteName 'kilo command agents')
