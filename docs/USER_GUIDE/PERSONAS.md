# 🎭 PERSONAS

> 💡 **When to use each persona** — The Baba system has 6 roles with distinct responsibilities.

---

## 🎯 Quick Selection

| Situation | Use | Invoke |
|---|---|---|
| Fuzzy goal → sized tasks | **BabaScrumMaster** | `"Use BabaScrumMaster to plan X"` |
| Mentorship review, no code | **BabaSensei** | `"Use BabaSensei to review X"` |
| Implementation with plan gate | **BabaDev** | `"Use BabaDev to implement X"` |
| Adversarial QA + test strategy | **BabaTester** | `"Use BabaTester to test X"` |
| Hard/soft tier quality verdict | **BabaReviewer** | `"Use BabaReviewer to review X"` |
| Let agent decide | *(default)* | Just describe the task |

---

## 📋 Persona Details

### 🟣 BabaScrumMaster
**Pragmatic delivery lead** — Turns fuzzy goals into ICE-prioritized, sprint-ready tasks.

| Owns | Terminal | Key Behavior |
|---|---|---|
| INTAKE, BACKLOG, SPRINT, TASK_PLAN, SPEC | `TASK_PLAN` → `HANDOFF` | Sizes with LOC band (sanity), never reviews code, hands to core pipeline |

**Use when:** You have a goal/feature request without a concrete target file.

---

### 🔵 BabaSensei
**Wise, opinionated senior engineer** — Reviews as teaching moments, never patches.

| Owns | Terminal | Key Behavior |
|---|---|---|
| CHECKLIST, DOCS, REVIEW, PLAN | `PLAN` → `HANDOFF` | Direct tone, opinions encouraged, one-sentence teaching note at handoff |

**Use when:** You want mentorship feedback, architectural guidance, scope decisions.

---

### 🟢 BabaDev
**Senior implementation lead** — Smallest architecturally sound fix first.

| Owns | Terminal | Key Behavior |
|---|---|---|
| PATCH | `PATCH` | Strong defaults, explicit exceptions, classifies tester guidance (binding/strong/weak), asks ≤3 MC questions if unclear |

**Use when:** You have an approved plan and want implementation with verification.

---

### 🟠 BabaTester
**Adversarial QA** — Thinks in edge cases, failure modes, adversarial inputs.

| Owns | Terminal | Key Behavior |
|---|---|---|
| REVIEW → TEST_STRATEGY | `TEST_STRATEGY` → `HANDOFF` | Never fixes code; produces test strategy with trigger, expected vs actual, missing test type; hard-tier = exploitable paths |

**Use when:** You want regression risk analysis, edge case discovery, test strategy.

---

### 🔴 BabaReviewer
**Quality gate** — Evaluates against H1-H40, S1-S20, blocks merges on hard-tier failures.

| Owns | Terminal | Key Behavior |
|---|---|---|
| REVIEW (merge audit) | `REVIEW` | Receives merged findings, verifies merge protocol, verdicts: MERGE BLOCKED / APPROVED WITH FIXES / LGTM |

**Use when:** You need a formal quality verdict before merge.

---

### ⚫ Process Master
**Embedded enforcer** — Phase ordering, checklist lifecycle, no-skip rules.

| Owns | Terminal | Key Behavior |
|---|---|---|
| Phase transitions, checklist ticks | embedded | Always present, hard guards |

---

## 🔄 Recommended Session Flow

```text
BabaScrumMaster (optional upstream)
    → INTAKE → BACKLOG → SPRINT → TASK_PLAN → [SPEC] → HANDOFF
BabaSensei (core review)
    → CHECKLIST → DOCS → REVIEW → PLAN → HANDOFF
BabaTester (adversarial)
    → CHECKLIST → DOCS → REVIEW → TEST_STRATEGY → HANDOFF
BabaDesigner (if UI/UX)
    → PLAN → DESIGN_PLAN → HANDOFF
BabaDev (implementation)
    → PLAN (from HANDOFF) → PATCH
```

**Multi-persona note:** BabaSensei partitions file inventory by layer; spawns N reviewers (N = min(ceil(files/50), 4)) + BabaTester. Merge protocol combines findings.

---

## ⚠️ Scope Boundaries

| Persona | NEVER Does |
|---|---|
| BabaScrumMaster | Review code, write patches |
| BabaSensei | Write code, enter PATCH |
| BabaTester | Plan fixes, author implementation |
| BabaDev | Skip plan approval, ignore tester guidance silently |
| BabaReviewer | Author patches, make scope decisions |

---

## 🎮 OpenCode Commands

| Command | Effect |
|---|---|
| `/baba scrummaster` | Activate BabaScrumMaster, start phase flow |
| `/baba sensei` | Activate BabaSensei, start phase flow |
| `/baba dev` | Activate BabaDev, start phase flow |
| `/baba tester` | Activate BabaTester, start phase flow |
| `/baba reviewer` | Activate BabaReviewer, start phase flow |

---

## 📚 Related

- Phase flow: `USER_GUIDE/PHASES.md`
- Execution modes: `USER_GUIDE/EXECUTION_MODES.md`
- Handoff contract: `REFERENCE/SYSTEM_OVERVIEW.md#handoff-contract`
- Persona definitions: `prompt-system/01-personas.md`
