# Protocols

This file is a pointer. It is no longer the source of truth for protocol
detail.

**Canonical source: [`prompt-system/07-protocols.md`](../../prompt-system/07-protocols.md)**

## What was recovered from this file

This copy was the only place several protocol sections existed. They have been
moved into the canonical file, which is the deployed one -- `AGENTS.md` ships
only `AGENTS.md` plus `prompt-system/`:

- `### Reading Plan` and `### Reading Verification block` (`## Reading Protocol`)
- The discovered-evidence schema under `## Discovery Protocol` `### Output`
- `## Library selection`
- `## API architecture & design` and its 15 subsections
- `## Spec lifecycle` and its 7 subsections
- `## Relevance Discovery` and its 4 subsections
- `## Session file locks (Removed)`

`## Drift detection` and `## Discuss mode` were recovered earlier. Nothing
else in this file was unique: the remaining differences were this copy's stale
`/subtask` spawn reference, two of its own typos ("house prefs", "derefs"),
and dash-style normalization in the canonical file.

The recovery was verified before this file was replaced: a heading-set diff
showed all 121 headings present in canonical, and a line-level containment
check over every substantive line left no protocol rule unaccounted for.

## Why this file is a pointer

A duplicate of the protocol set is a second source of truth that silently
drifts. This copy had already drifted: it still referenced the removed
`/subtask` command, and it disagreed with the canonical file on H-numbers.

`AGENTS.md` deploys only `AGENTS.md` plus `prompt-system/`. Protocol detail that
lives outside `prompt-system/` is protocol detail that never reaches a target
project.

## Related

- `prompt-system/07-protocols.md` -- canonical protocol detail (authority)
- `prompt-system/00-system.md` -- orchestrator, load order, concurrency
- `prompt-system/03-output-and-state.md` -- phase templates
- `prompt-system/06-misc.md` -- PATCH execution protocol
- `prompt-system/scripts/test-cross-reference-integrity.ps1` -- asserts `file.md` + `## Anchor` citations resolve
