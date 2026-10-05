# Plan-Actual Gate

This file is a pointer. It is no longer the source of truth for the
Plan-Versus-Actual Gate protocol.

**Canonical source: [`prompt-system/08-plan-actual-gate.md`](../../prompt-system/08-plan-actual-gate.md)**

## Why this file is a pointer

All 13 of this copy's headings exist in the canonical file, and the two
substantive additions it carried have been recovered:

- The **anti-tautology examples** (`verify: rg "TODO" newfile -- expect: silent`
  and `verify: rg "fix-me" file -- expect: pass`) are already canonical, at
  `### Anti-tautology note`.

What this copy still had that canonical does not is **stale**: four references to
session-file-lock verification (`runs after lock verification`,
`Gate proceeds to lock verification and the ask`). Locking was removed from the
system; `prompt-system/07-protocols.md` `## Session file locks (Removed)` records
the removal. Canonical `08-plan-actual-gate.md` contains no lock references at all.

Leaving this file in place meant a reader could follow its staging instructions
and wait on a lock step that no longer exists.

## Related

- `prompt-system/08-plan-actual-gate.md` -- expect vocabulary, run semantics, denylist, retry loop, recording
- `prompt-system/06-misc.md` -- the PATCH protocol this gate runs inside
- `prompt-system/scripts/test-cross-reference-integrity.ps1` -- asserts `file.md` + `## Anchor` citations resolve
