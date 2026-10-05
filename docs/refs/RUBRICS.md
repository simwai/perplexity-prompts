# Rubrics (H1-H38, S1-S25, L1-L10)

This file is a pointer. It is no longer the source of truth for rubric identity
or rubric text.

**Canonical source: [`prompt-system/04-rubrics.md`](../../prompt-system/04-rubrics.md)**

## Detail layer

Detection, enforcement, auto-exception, and the scope matrix for `H13`-`H38`
live in [`prompt-system/rules.md`](../../prompt-system/rules.md). Rubric
identity -- which `H`-number belongs to which rule -- is owned by
`prompt-system/04-rubrics.md` alone.

## Why this file is a pointer

Two copies of the rubric set existed and this one was a strict subset of the
canonical file. Both defined the same 73 rubric ids (`H1`-`H38`, `S1`-`S25`,
`L1`-`L10`) with none unique to this copy, so nothing was lost by replacing it.
It had drifted in three ways:

- It skipped `H38` entirely and numbered "No Multi-Concept Files" two ids above
  the canonical range, leaving a gap exactly where the registry ends.
- Its `H11` still said "once per session", predating the second Playwright run at
  the commit gate.
- Every `H13`-`H38` entry carried a `See docs/refs/RULES.md H<n>` pointer for
  detection detail. That file is itself now a pointer with no detail in it, so all
  59 of those pointers dangled.

Separately, the canonical registry was missing `S13` entirely -- the only
definition lived here. It has been recovered into the canonical file.

`AGENTS.md` deploys only `AGENTS.md` plus `prompt-system/`. A rubric set that
lives outside `prompt-system/` is a rubric set that never reaches a target
project.

## Related

- `prompt-system/04-rubrics.md` -- rubric identity (authority) and one-line summaries
- `prompt-system/04b-rubrics-logical.md` -- L1-L10 detail for trading/backtest targets
- `prompt-system/rules.md` -- detection, enforcement, auto-exception, scope matrix
- `prompt-system/00-system.md` -- load order
- `prompt-system/scripts/test-rubric-id-integrity.ps1` -- asserts the id-to-title mapping agrees across the registry, the detail layer, and `docs/refs/`
