# Rules (H13-H38 detection and enforcement)

This file is a pointer. It is no longer the source of truth for the H13-H38
detection, enforcement, auto-exception, and scope detail.

**Canonical source: [`prompt-system/rules.md`](../../prompt-system/rules.md)**

Rubric identity -- which `H`-number belongs to which rule -- is owned by
[`prompt-system/04-rubrics.md`](../../prompt-system/04-rubrics.md). That file is
the sole authority. `prompt-system/rules.md` supplies the detection and
enforcement mechanism for those same numbers and must never assign a different
title to an id.

## Why this file is a pointer

Three copies of the H13-H38 rules previously existed: this file,
`prompt-system/rules.md`, and the rubric headings in `04-rubrics.md`. They
diverged by up to three `H`-numbers, and this copy sat outside the
`prompt-system/` tree, which is what `AGENTS.md` deploys to a target project. A
deployed repository therefore received the rubric ids but not the detection and
enforcement detail that makes them actionable.

`AGENTS.md` deploys only `AGENTS.md` plus `prompt-system/`. Keeping the detail
inside `prompt-system/` is what makes it survive deployment.

## Related

- `prompt-system/04-rubrics.md` -- rubric identity (authority) and one-line summaries
- `prompt-system/rules.md` -- detection, enforcement, auto-exception, scope matrix
- `prompt-system/00-system.md` -- load order
- `prompt-system/scripts/test-rubric-id-integrity.ps1` -- enforces that the id-to-title mapping agrees across all three
