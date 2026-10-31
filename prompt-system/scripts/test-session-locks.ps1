<#
.SYNOPSIS
    Regression tests for session-locks.ps1.
.DESCRIPTION
    Exercises acquisition, ownership, release, TTL liveness, import resolution,
    and the commit-gate query against a synthetic fixture.

    Cases deliberately covered that the earlier 47-line suite did not hold:
      - two different session ids contending for one path (the core invariant)
      - self-owned re-entry refreshing instead of blocking
      - release refusing a peer's lock
      - an expired lock ceasing to block
      - same-leaf files in different directories NOT becoming dependents
        (the leaf-name regex false positive)
      - the commit-gate query excluding self-owned locks

    Uses a temp fixture only. Never touches the real checkout or its lock dir.
.EXAMPLE
    pwsh -NoProfile -File prompt-system/scripts/test-session-locks.ps1
.EXAMPLE
    pwsh -NoProfile -File prompt-system/scripts/test-session-locks.ps1 -LocksPath C:\temp\old.ps1
#>

param(
    [string]$LocksPath = (Join-Path $PSScriptRoot 'session-locks.ps1')
)

$ErrorActionPreference = 'Stop'

$script:Failures = @()

function Add-Failure {
    param([string]$Message)
    $script:Failures += $Message
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { Add-Failure $Message }
}

# ── Fixture ──────────────────────────────────────────────────────────────────

$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ("session-locks-test-" + [guid]::NewGuid().ToString('N'))

function Write-FixtureFile {
    param([string]$RelativePath, [string]$Content)
    $full = Join-Path $fixture $RelativePath
    $dir = Split-Path -Parent $full
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllText($full, $Content)
}

try {
    . $LocksPath

    # src/a/index.ts and src/b/index.ts share a leaf name on purpose.
    Write-FixtureFile 'src/a/index.ts'  "export const a = 1`n"
    Write-FixtureFile 'src/b/index.ts'  "export const b = 1`n"
    Write-FixtureFile 'src/consumer.ts' "import { a } from './a/index'`nimport pkg from 'some-package'`n"
    Write-FixtureFile 'README.md'       "# fixture`n"

    # ── Flat name ────────────────────────────────────────────────────────────

    Assert-True ((ConvertTo-FlatName 'src/a/index.ts') -eq 'src--a--index.ts') `
        "ConvertTo-FlatName should map separators to --, got '$(ConvertTo-FlatName 'src/a/index.ts')'"
    Assert-True ((ConvertTo-FlatName './src/app.ts') -eq 'src--app.ts') `
        "ConvertTo-FlatName should strip a leading ./"

    # ── Import resolution ────────────────────────────────────────────────────

    $resolved = Resolve-ImportSpecifier -RepoRoot $fixture -FromFileRelative 'src/consumer.ts' -Specifier './a/index'
    Assert-True ($resolved -eq 'src/a/index.ts') `
        "Resolve-ImportSpecifier should resolve './a/index' to src/a/index.ts, got '$resolved'"
    Assert-True ($null -eq (Resolve-ImportSpecifier -RepoRoot $fixture -FromFileRelative 'src/consumer.ts' -Specifier 'some-package')) `
        'Resolve-ImportSpecifier should ignore a bare package specifier'

    $depSet = Get-DependencySet -RepoRoot $fixture -TargetFileRelative 'src/a/index.ts'

    Assert-True (@($depSet.Importers) -contains 'src/consumer.ts') `
        "consumer.ts imports src/a/index.ts and must appear in Importers; got '$($depSet.Importers -join ', ')'"

    # The regression: a leaf-name match would report src/b/index.ts as an
    # importer of src/a/index.ts purely because both are named index.ts.
    Assert-True (@($depSet.Importers) -notcontains 'src/b/index.ts') `
        "src/b/index.ts shares a leaf name but does not import src/a/index.ts; it must NOT appear in Importers; got '$($depSet.Importers -join ', ')'"

    # ── Liveness ─────────────────────────────────────────────────────────────

    $fresh = (Get-Date).ToUniversalTime().ToString('o')
    $expired = (Get-Date).ToUniversalTime().AddMinutes(-45).ToString('o')

    Assert-True (Test-LockLive $fresh) 'a just-acquired timestamp must be live'
    Assert-True (-not (Test-LockLive $expired)) 'a 45-minute-old timestamp must be expired against a 30-minute TTL'
    Assert-True (-not (Test-LockLive 'not-a-timestamp')) 'an unparseable timestamp must read as dead, not live'
    Assert-True (-not (Test-LockLive $null)) 'a missing timestamp must read as dead'

    # ── Acquisition and contention ───────────────────────────────────────────

    $acquired = Enter-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-A' -RepoRoot $fixture
    Assert-True ($acquired.Success -and -not $acquired.Refreshed) 'session-A must acquire a free path'

    $blocked = Enter-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-B' -RepoRoot $fixture
    Assert-True ($blocked.Success -eq $false -and $blocked.Blocked) 'session-B must be blocked by a live session-A lock'
    Assert-True (@($blocked.Peers).Count -ge 1) 'a blocked acquisition must name the peer holding the lock'
    Assert-True (@($blocked.Decision).Count -ge 2) 'contention must return a user-owned decision set'

    $reentry = Enter-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-A' -RepoRoot $fixture
    Assert-True ($reentry.Success -and $reentry.Refreshed) 'session-A re-entering must refresh, not block'

    # ── Commit-gate query ────────────────────────────────────────────────────

    # The query returns an array, and PowerShell unrolls an array returned from a
    # function -- the call site must re-wrap before indexing.
    $selfView = @(Get-BlockingPeersForPaths -RepoRelativePaths @('src/a/index.ts') -SessionId 'session-A' -RepoRoot $fixture)
    Assert-True ($selfView.Count -eq 0) 'the commit gate must not report the committing session own lock as a conflict'

    $peerView = @(Get-BlockingPeersForPaths -RepoRelativePaths @('src/a/index.ts', 'README.md') -SessionId 'session-B' -RepoRoot $fixture)
    Assert-True ($peerView.Count -eq 1) "the commit gate must report exactly one conflicting path for session-B; got $($peerView.Count)"
    if ($peerView.Count -eq 1) {
        Assert-True ($peerView[0].Path -eq 'src/a/index.ts') "the conflict should be src/a/index.ts, got '$($peerView[0].Path)'"
        Assert-True ($peerView[0].Peers[0].Owner -eq 'session-A') 'the conflict must name session-A as owner'
        Assert-True ($peerView[0].Peers[0].Type -eq 'PerFile') 'a direct lock should be reported as PerFile'
    }

    # ── Release ownership ────────────────────────────────────────────────────

    $ownRelease = Exit-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-A' -RepoRoot $fixture
    Assert-True ($ownRelease.Success -and -not $ownRelease.Refused) 'the owning session must be able to release'
    $gone = -not (Test-Path -LiteralPath (Join-Path $fixture '.session-locks/src--a--index.ts.lock'))
    Assert-True $gone 'an owner release must remove the lock directory'

    # Re-acquire so there is a foreign lock to refuse.
    [void](Enter-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-A' -RepoRoot $fixture)

    $foreignRelease = Exit-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-E' -RepoRoot $fixture
    Assert-True ($foreignRelease.Success -eq $false -and $foreignRelease.Refused) `
        'releasing a peer lock must be refused'
    $stillThere = Test-Path -LiteralPath (Join-Path $fixture '.session-locks/src--a--index.ts.lock')
    Assert-True $stillThere 'a refused release must leave the lock directory in place'

    [void](Exit-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-A' -RepoRoot $fixture)

    $repeatRelease = Exit-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-A' -RepoRoot $fixture
    Assert-True ($repeatRelease.Success -and $repeatRelease.AlreadyReleased) `
        'releasing an absent lock is a no-op, not a failure'

    # ── Dependency-lock coverage ─────────────────────────────────────────────

    # Nothing holds src/a/index.ts at this point, so session-D takes the
    # dependency lock.
    $depLock = Enter-DependencyLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-D' -RepoRoot $fixture
    Assert-True ($depLock.Success) "a dependency lock on an uncontended path must succeed; blocked=$($depLock.Blocked)"
    Assert-True (@($depLock.Members) -contains 'src/consumer.ts') `
        "a dependency lock must record its member set including the importer; got '$($depLock.Members -join ', ')'"

    # session-E asking for that path now hits session-D's dependency lock.
    $depBlocked = Enter-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-E' -RepoRoot $fixture
    Assert-True ($depBlocked.Blocked) 'a peer dependency lock must block a per-file lock on a covered path'
    if ($depBlocked.Blocked) {
        Assert-True ($depBlocked.Peers[0].Type -eq 'Dependency') `
            "coverage through a dependency lock must be reported as Dependency, got '$($depBlocked.Peers[0].Type)'"
    }

    $depRelease = Exit-DependencyLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-D' -RepoRoot $fixture
    Assert-True ($depRelease.Success) 'the owning session must release a dependency lock'

    # ── Gate evaluation ──────────────────────────────────────────────────────

    # Create a fresh fixture for gate tests
    $gateFixture = Join-Path ([System.IO.Path]::GetTempPath()) ("session-locks-gate-" + [guid]::NewGuid().ToString('N'))
    try {
        New-Item -ItemType Directory -Path $gateFixture -Force | Out-Null
        . $LocksPath

        # Non-engaged when no locks
        $eval1 = Get-LockGateEvaluation -StagedPaths @('src/x.ts') -SessionId 'session-X' -RepoRoot $gateFixture
        Assert-True (-not $eval1.Engaged -and -not $eval1.ShouldBlock) 'gate must not be engaged with no live locks'

        # Engaged with locks, no SESSION_ID -> block
        $env:SESSION_ID = 'session-A'
        [void](Enter-FileLock -RepoRelativePath 'src/a.ts' -SessionId 'session-A' -RepoRoot $gateFixture)
        Remove-Item Env:\SESSION_ID
        $eval2 = Get-LockGateEvaluation -StagedPaths @('src/a.ts') -SessionId $null -RepoRoot $gateFixture
        Assert-True ($eval2.Engaged -and $eval2.ShouldBlock -and $eval2.Type -eq 'Unattributed') 'engaged with no SESSION_ID must block as unattributed'

        # Engaged, same session, covered
        $env:SESSION_ID = 'session-A'
        $eval3 = Get-LockGateEvaluation -StagedPaths @('src/a.ts') -SessionId 'session-A' -RepoRoot $gateFixture
        Assert-True ($eval3.Engaged -and -not $eval3.ShouldBlock) 'engaged with covered session lock must pass'
        Remove-Item Env:\SESSION_ID

        # Engaged, different session, peer conflict
        $env:SESSION_ID = 'session-B'
        $eval4 = Get-LockGateEvaluation -StagedPaths @('src/a.ts') -SessionId 'session-B' -RepoRoot $gateFixture
        Assert-True ($eval4.ShouldBlock -and $eval4.Type -eq 'PeerConflict') 'engaged with peer lock must block as conflict'
        Remove-Item Env:\SESSION_ID

        [void](Exit-FileLock -RepoRelativePath 'src/a.ts' -SessionId 'session-A' -RepoRoot $gateFixture)
    } finally {
        if (Test-Path -LiteralPath $gateFixture) {
            Remove-Item -LiteralPath $gateFixture -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # ── READ_ONLY host is inert ──────────────────────────────────────────────

    $env:BABA_READ_ONLY = '1'
    try {
        $roAcquire = Enter-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-R' -RepoRoot $fixture
        Assert-True ($roAcquire.Skipped -and $roAcquire.Success) 'a READ_ONLY host must skip acquisition rather than write'
        $roRelease = Exit-FileLock -RepoRelativePath 'src/a/index.ts' -SessionId 'session-R' -RepoRoot $fixture
        Assert-True ($roRelease.Skipped) 'a READ_ONLY host must skip release'
    } finally {
        Remove-Item Env:\BABA_READ_ONLY -ErrorAction SilentlyContinue
    }
}
finally {
    if (Test-Path -LiteralPath $fixture) {
        Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($script:Failures.Count -gt 0) {
    foreach ($failure in $script:Failures) {
        Write-Host "FAIL $failure" -ForegroundColor Red
    }
    Write-Host "test-session-locks: $($script:Failures.Count) assertion(s) failed" -ForegroundColor Red
    exit 1
}

Write-Host "test-session-locks: contention, ownership, TTL, import resolution, and gate query intact" -ForegroundColor Green
exit 0
