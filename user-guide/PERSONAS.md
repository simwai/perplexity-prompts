# PERSONAS

> **When to use each persona** — The Baba system has 8 personas plus an embedded Process Master.

---

## Quick Selection

| Situation | Use | Invoke |
|---|---|---|
| Fuzzy goal → sized tasks | **BabaScrumMaster** | `"Use BabaScrumMaster to plan X"` |
| Mentorship review, no code | **BabaSensei** | `"Use BabaSensei to review X"` |
| Implementation with plan gate | **BabaDev** | `"Use BabaDev to implement X"` |
| Adversarial QA + test strategy | **BabaTester** | `"Use BabaTester to test X"` |
| Quant/alpha/risk review | **UltraProQuant** | `"Use UltraProQuant to review X"` |
| Hard/soft tier quality verdict | **BabaReviewer** | `"Use BabaReviewer to review X"` |
| Business goal, product framing | **BabaCEO** | `"Use BabaCEO to frame X"` |
| Let agent decide | *(default)* | Just describe the task |

---

## Persona Details

### BabaScrumMaster

**Pragmatic delivery lead** — Turns fuzzy goals into ICE-prioritized, sprint-ready tasks.

| Owns | Terminal | Key Behavior |
|---|---|---|
| INTAKE, BACKLOG, SPRINT, TASK_PLAN, SPEC | `TASK_PLAN` → `HANDOFF` | Sizes with LOC band (sanity), never reviews code, hands to core pipeline |

**Use when:** You have a goal/feature request without a concrete target file.

---

### BabaSensei

**Wise, opinionated senior engineer** — Reviews as teaching moments, never patches. Default spec author after the v1.0.0 reassignment.

| Owns | Terminal | Key Behavior |
|---|---|---|
| SPEC | `SPEC` → `HANDOFF` (to BabaReviewer) | Direct tone, opinions encouraged, one-sentence teaching note at handoff |

**Use when:** You want mentorship feedback, architectural guidance, scope decisions.

---

### BabaDev

**Senior implementation lead** — Smallest architecturally sound fix first.

| Owns | Terminal | Key Behavior |
|---|---|---|
| PATCH | `PATCH` | Strong defaults, explicit exceptions, classifies tester guidance (binding/strong/weak), asks ≤3 MC questions if unclear |

**Use when:** You have an approved plan and want implementation with verification.

---

### BabaTester

**Adversarial QA** — Thinks in edge cases, failure modes, adversarial inputs.

| Owns | Terminal | Key Behavior |
|---|---|---|
| REVIEW → TEST_STRATEGY | `TEST_STRATEGY` → `HANDOFF` | Never fixes code; produces test strategy with trigger, expected vs actual, missing test type; hard-tier = exploitable paths |

**Use when:** You want regression risk analysis, edge case discovery, test strategy.

---

### UltraProQuant

**Master quant / algorithmic trader** -- Quant review with hard-tier authority on L1-L10 logical rubrics.

| Owns | Terminal | Key Behavior |
|---|---|---|
| REVIEW → TEST_STRATEGY_QUANT | `TEST_STRATEGY_QUANT` → `HANDOFF` | Never patches; alpha logic, risk math, backtest integrity, microstructure; findings BINDING/STRONG HINT/WEAK HINT; auto-spawns with BabaTester when quant files in scope (T-24) |

**Use when:** The target touches strategy, backtest, risk, signal, portfolio, or crypto/DeFi modules.

---

### BabaReviewer

**Quality gate** — Evaluates against H1-H38, S1-S25, blocks merges on hard-tier failures.

| Owns | Terminal | Key Behavior |
|---|---|---|
| REVIEW (merge audit) | `REVIEW` | Receives merged findings, verifies merge protocol, verdicts: MERGE BLOCKED / APPROVED WITH FIXES / LGTM |

**Use when:** You need a formal quality verdict before merge.

---

### BabaCEO

**Product owner and executive decision-maker** -- Turns fuzzy business goals into framed product intent.

| Owns | Terminal | Key Behavior |
|---|---|---|
| INTAKE, goal framing, success criteria | `INTAKE` -> `HANDOFF` (to BabaScrumMaster) | Direct tone, opinions on scope/priority encouraged, never touches implementation |

**Use when:** You have a business goal, product decision, or prioritization question and need product framing before planning.

---

### Process Master

**Embedded enforcer** — Phase ordering, checklist lifecycle, no-skip rules.

| Owns | Terminal | Key Behavior |
|---|---|---|
| Phase transitions, checklist ticks | embedded | Always present, hard guards |

---

## Recommended Session Flow

```text
BabaCEO (optional upstream, product framing)
    -> INTAKE -> HANDOFF (to BabaScrumMaster)
BabaScrumMaster (optional upstream)
    -> INTAKE -> BACKLOG -> SPRINT -> TASK_PLAN -> [SPEC] -> HANDOFF
BabaSensei (spec author)
    -> SPEC -> HANDOFF (to BabaReviewer)
BabaTester (adversarial)
    -> CHECKLIST -> DOCS -> REVIEW -> TEST_STRATEGY -> HANDOFF
UltraProQuant (quant review, auto-spawned with BabaTester when quant files in scope)
    -> CHECKLIST -> DOCS -> REVIEW -> TEST_STRATEGY_QUANT -> HANDOFF
BabaDesigner (if UI/UX)
    -> PLAN -> DESIGN_PLAN -> HANDOFF
BabaDev (implementation)
    -> PLAN (from HANDOFF) -> PATCH
```

**Multi-persona note:** The orchestrating session partitions the file inventory by layer; spawns N BabaSensei reviewers (N = min(ceil(files/50), 4)) + BabaTester, plus UltraProQuant when quant modules are in scope. Merge protocol combines findings (Sensei authority on hard-tier, union on soft-tier).

---

## ⚠️ Scope Boundaries

| Persona | NEVER Does |
|---|---|
| BabaScrumMaster | Review code, write patches |
| BabaSensei | Write code, enter PATCH |
| BabaTester | Plan fixes, author implementation |
| UltraProQuant | Patch code, plan fixes, override Sensei authority on H-tier |
| BabaDev | Skip plan approval, ignore tester guidance silently |
| BabaCEO | Write code, review implementation, author specs |
| BabaDesigner | Patch code, implement UI decisions |
| BabaReviewer | Author patches, make scope decisions |

---

## OpenCode Commands

| Command | Effect |
|---|---|
| `/baba scrummaster` | Activate BabaScrumMaster, start phase flow |
| `/baba sensei` | Activate BabaSensei, start phase flow |
| `/baba dev` | Activate BabaDev, start phase flow |
| `/baba tester` | Activate BabaTester, start phase flow |
| `/baba ultra-pro-quant` | Activate UltraProQuant for quant review |
| `/baba reviewer` | Activate BabaReviewer, start phase flow |
| `/baba designer` | Activate BabaDesigner for UI/UX design planning |
| `/baba ceo` | Activate BabaCEO for product framing, start INTAKE flow |

---

## Related

- Phase flow: [`user-guide/PHASES.md`](PHASES.md)
- Execution modes: [`user-guide/EXECUTION_MODES.md`](EXECUTION_MODES.md)
- Handoff contract: [`prompt-system/01-personas.md`](../prompt-system/01-personas.md) `## Handoff contract`
- Persona definitions: [`prompt-system/01-personas.md`](../prompt-system/01-personas.md)
