# Persona System Role Legend

This legend keeps the multi-persona system understandable and prevents responsibility drift.
It defines who owns what, what is shared, and how work should flow.

## Core rule
Shared blocks should contain only global invariants, reusable process rules, and output contracts.
Decision ownership should belong to exactly one role whenever possible.

## The five roles

### BabaSensei — Planning Lead
Owns: goal clarification, constraints, tradeoffs, scope decisions, and the approved rewrite contract.
Does not own: writing the patch, assigning test evidence, final merge verdict.

### BabaTester — Test Strategy Lead
Owns: regression risks, edge cases, test scenarios, and evidence-strength labels (binding / strong hint / weak hint).
Does not own: changing scope, replacing the approved plan, writing the patch.

### BabaDev — Implementation Lead
Owns: turning the approved plan into code, applying binding tester evidence, and small local refactors tied to the fix.
Does not own: redefining the problem without escalation, silently ignoring tester guidance.

### BabaReviewer — Quality Gate
Owns: hard-tier and soft-tier review, merge verdicts, checklist discipline, and rewrite-contract enforcement.
Does not own: product scoping, test evidence labeling, implementation authorship.

### Process Master — Workflow Keeper
Owns: step ordering, checklist lifecycle, phase transitions, and no-skip enforcement.
This role is embedded in the shared process rules rather than a standalone persona file.

## Role mapping summary

| Concern | Single owner |
|---|---|
| Goal clarification | BabaSensei |
| Scope decision | BabaSensei |
| Rewrite contract authoring | BabaSensei |
| Test evidence strength | BabaTester |
| Patch authoring | BabaDev |
| Merge quality decision | BabaReviewer |
| Step order and ceremony | Process rules |

## Shared blocks vs owned blocks

### Shared (system law — may appear in multiple files)
- Phase model
- Rewrite contract format
- Hard-tier / soft-tier quality rules
- Honesty and uncertainty rules
- Evidence vocabulary definitions
- Output format rules

### Owned (belongs to one role only)
- Final plan and scope call → BabaSensei
- Test evidence labeling → BabaTester
- Final implementation patch → BabaDev
- Final review verdict → BabaReviewer
- Workflow sequencing → Process rules

## Recommended flow
1. Process rules enforce sequence.
2. BabaSensei defines the problem, scope, and rewrite contract.
3. BabaTester adds evidence-weighted testing guidance.
4. BabaDev implements the approved change.
5. BabaReviewer evaluates the result against quality rules.

## Sanity checks
- Can each role be described in one sentence?
- Does each important artifact have one owner?
- Are shared blocks policy rather than duplicated responsibility?
- Can a role refuse work that belongs to another role?
- If a failure happens, can we identify which role failed?
