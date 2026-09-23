# 📖 GLOSSARY

> 💡 **Central terminology reference** for the Baba prompt system. Terms are linked to their canonical source files in `prompt-system/`.

---

## 🔤 Terms

| Term | Definition | Source | Related |
|---|---|---|---|
| **Baba** | The persona system comprising 6 roles: ScrumMaster, Sensei, Dev, Tester, Reviewer, Process Master | `01-personas.md` | Persona, Handoff |
| **CHECKLIST** | Phase that inventories target files, selects review criteria (H/S/L tiers), and logs docs needs | `00-system.md`, `03-output-and-state.md` | Review, Docs |
| **DIRECT** | Execution mode for clear low-risk work without phase templates; uses `[MODE: DIRECT]` | `00-system.md`, `03-output-and-state.md` | Structured, Auto |
| **DRIFT** | Read-only diagnostic phase comparing `SPECS/` artifacts against implemented code | `07-protocols.md`, `08-plan-actual-gate.md` | Spec, Plan-Actual |
| **HANDOFF** | Structured contract transferred between personas; validated before receiver enters phase | `01-personas.md`, `03-output-and-state.md` | Persona, Phase |
| **ICE** | Prioritization score: Impact × Confidence × Ease (each 1-10); used in backlog/sprint planning | `01-personas.md`, `07-protocols.md` | Backlog, Sprint |
| **PLAN-ACTUAL GATE** | Verification that each `Will change` item from approved plan landed in staged files | `08-plan-actual-gate.md`, `06-misc.md` | Patch, Commit |
| **REVIEW** | Phase that scores findings against rubrics (H1-H40, S1-S20, L1-L10) and owns confirmation decision | `00-system.md`, `04-rubrics.md` | Checklist, Plan |
| **SPEC** | Optional planning artifact in `SPECS/NNN-name/spec.md` with user stories, FRs, SCs | `07-protocols.md`, `01-personas.md` | ScrumMaster, Drift |
| **STRUCTURED** | Execution mode using full phase-gated workflow: CHECKLIST → DOCS → REVIEW → PLAN → PATCH | `00-system.md`, `03-output-and-state.md` | Direct, Auto |
| **AUTO** | Default execution mode; agent chooses DIRECT or STRUCTURED based on task risk | `00-system.md` | Direct, Structured |
| **BLOCKED** | Phase emitted when prerequisites missing; documents needed input and next user action | `00-system.md`, `03-output-and-state.md` | Phase transitions |
| **CONFORMANCE** | Checklist of protocol invariants verified before each phase transition | `docs/REFERENCE/PROTOCOLS.md` | All phases |
| **DECISION FORMAT** | Required `# Decision Needed` block with 2-3 options, recommended as bold **A** | `00-system.md`, `02-decision-prompts.md` | Review, Plan |
| **LOOP PROTECTION** | Doom-loop guard: 3 identical read fingerprints without state change = protocol breach | `00-system.md` | Read ledger, MCP |
| **MERGE VERDICT** | BabaReviewer output: MERGE BLOCKED / APPROVED WITH FIXES / LGTM | `01-personas.md`, `04-rubrics.md` | Review, Patch |
| **MUST-PRESERVE** | Rewrite contract field: constraints the patch must not break | `03-output-and-state.md`, `06-misc.md` | Patch, Contract |
| **MUST-ELIMINATE** | Rewrite contract field: confirmed violations the patch must remove | `03-output-and-state.md`, `06-misc.md` | Patch, Contract |
| **FORBIDDEN-IN-PATCH** | Rewrite contract field: tokens/patterns that must not appear in patch | `03-output-and-state.md`, `06-misc.md` | Patch, Contract |
| **PHASE HEADER** | Required `[PHASE: NAME]` at top of every structured response | `00-system.md` | All phases |
| **READING PLAN** | Computed dependency closure (depth 3) that must be fully read before analysis output | `07-protocols.md`, `03-output-and-state.md` | Checklist, Review |
| **REWRITE CONTRACT** | Complete specification for PATCH: target, preserve, eliminate, forbidden, must-use, must-route | `03-output-and-state.md`, `06-misc.md` | Plan, Patch |
| **SESSION STATE** | Per-session file `SESSION_STATE-<id>.md` tracking phase, approvals, findings, edits, locks | `03-output-and-state.md` | All phases |
| **STARTUP** | Mandatory first phase: load all system files, emit fingerprint, verify completion | `00-system.md` | All sessions |
| **STYLE POLICY** | Project-level choice: `preserve-local` or `upgrade-house-style` recorded in `STYLE_POLICY.md` | `00-system.md`, `05-impl-style.md` | Patch, Convention |
| **VERIFICATION GATE** | Post-patch: diff inspect, lint, checks, regression baseline/post-fix, Playwright smoke | `06-misc.md`, `08-plan-actual-gate.md` | Patch, Commit |

---

## 🏷️ Phase Names (Canonical)

| Phase | Purpose | Entry From | Exit To |
|---|---|---|---|
| `STARTUP` | Load system, emit fingerprint | — | `CHECKLIST` / `INTAKE` / `DISCUSS` / `BLOCKED` |
| `INTAKE` | Goal, stack, scope, success criteria, milestones | `STARTUP` | `BACKLOG` |
| `BACKLOG` | ICE-prioritized items grouped by milestone | `INTAKE` | `SPRINT` |
| `SPRINT` | Selected items, board, completion criteria | `BACKLOG` | `TASK_PLAN` |
| `TASK_PLAN` | Single task card with size, ICE, DoD | `SPRINT` | `CHECKLIST` / `SPEC` |
| `SPEC` | Author spec artifact in `SPECS/` | `TASK_PLAN` | `CHECKLIST` |
| `CHECKLIST` | File inventory, criteria selection, docs log | `STARTUP` / `TASK_PLAN` / `SPEC` | `DOCS` / `REVIEW` |
| `DOCS` | Version/evidence for version-sensitive judgments | `CHECKLIST` | `REVIEW` |
| `REVIEW` | Score findings, mitigations, confirmation decision | `CHECKLIST` / `DOCS` | `PLAN` / `TEST_STRATEGY` / `DRIFT` |
| `TEST_STRATEGY` | BabaTester: binding/strong/weak hints, regression gaps | `REVIEW` | `HANDOFF` |
| `PLAN` | Fix plan with conventions, rewrite contract draft | `REVIEW` | `PATCH` / `HANDOFF` / `DESIGN_PLAN` |
| `DESIGN_PLAN` | BabaDesigner: UI/UX decisions, constraints | `PLAN` | `HANDOFF` |
| `HANDOFF` | Structured persona-to-persona transfer | `PLAN` / `DESIGN_PLAN` / `TEST_STRATEGY` | Next persona's phase |
| `PATCH` | Implementation with verification, commit/push gate | `PLAN` / `HANDOFF` | `DRIFT` / `FAILURE` / close |
| `DRIFT` | Spec vs code comparison (read-only) | `PATCH` / any | `PLAN` / prior |
| `DISCUSS` | Exploratory conversation, no findings without promotion | any | prior phase |
| `FAILURE` | Protocol breach after failed recovery | any | — (await retry) |

---

## 🎯 Persona Roles

| Persona | Owns | Terminal Phase | Key Behavior |
|---|---|---|---|
| **BabaScrumMaster** | INTAKE, BACKLOG, SPRINT, TASK_PLAN, SPEC | `TASK_PLAN` → `HANDOFF` | Decomposes goals into ICE-prioritized tasks |
| **BabaSensei** | CHECKLIST, DOCS, REVIEW, PLAN | `PLAN` → `HANDOFF` | Mentorship review, teaching notes, never patches |
| **BabaTester** | REVIEW → TEST_STRATEGY | `TEST_STRATEGY` → `HANDOFF` | Adversarial QA, edge cases, regression gaps |
| **BabaDev** | PATCH | `PATCH` | Smallest sound fix, classifies tester guidance |
| **BabaReviewer** | REVIEW (merge audit) | `REVIEW` | Hard/soft tier gate, merge verdicts |
| **Process Master** | Phase ordering, no-skip enforcement | embedded | Always present |

---

## 📁 File References

| File | Purpose |
|---|---|
| `prompt-system/00-system.md` | Orchestrator, phase model, routing, hard guards, load order |
| `prompt-system/01-personas.md` | Persona definitions, handoff contract, session flow |
| `prompt-system/02-decision-prompts.md` | Decision format, rendering rule, examples, auto-triggers |
| `prompt-system/03-output-and-state.md` | Phase templates, dual-section output, session state schema |
| `prompt-system/04-rubrics.md` | H1-H40, S1-S20, L1-L10 rubrics |
| `prompt-system/05-impl-style.md` | Implementation style, stack variants, conventions |
| `prompt-system/06-misc.md` | PATCH protocol, commit/push gate, leftover handling |
| `prompt-system/07-protocols.md` | Cross-cutting: artifacts, pre-commit, cross-team, lifecycle, drift, discuss, scrum |
| `prompt-system/08-plan-actual-gate.md` | Plan-vs-actual verification protocol |
| `prompt-system/rules.md` | H13-H40 mechanical detection/enforcement rules |

---

> 📝 **Note**: This glossary is maintained manually. For the authoritative definitions, see the source files in `prompt-system/`.