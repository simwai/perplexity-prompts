# Design: Autonomous Memory Capture for memory-worth

## Problem

`memory-worth` has all the machinery for durable, trust-scored, auto-archiving memory — but **none of it is wired**. Three subsystems exist and are tested, yet never called:

| Subsystem | Built & tested | Runtime caller |
|---|---|---|
| FTS5 index + triggers | `memory_fts_v2` + triggers on `memory` | watched empty legacy table |
| Governance (`computeStatus`, `shouldInvalidate`, `sweepGrounds`) | `core.test.ts` only | never called |
| Capture path | `memory_write` tool only | model must call it |

Result: DB empty, digest empty, `memory_search` unranked, no autonomous capture, no pruning.

---

## Goal

Wire the existing pieces into a self-sustaining loop:

```txt
user correction → capture grounded memory → digest retrieves it → governance prunes low-trust
```

---

## 1. Capture Signal

### What counts (high precision)

| Class | Markers | Example |
|---|---|---|
| **Prohibition** | don't, do not, avoid, stop, never, no longer | "avoid using try catch" |
| **Mandate** | always, must, make sure, from now on, going forward | "use pdm and venv" |
| **Correction** | instead, rather than, not X but Y, that's wrong | "use zod instead" |
| **Explicit** | remember that, note that, I told you | "remember to use zod" |

**Gate**: corrective/mandate marker **AND** the target generalizes (a practice, convention, or requirement — not a one-shot task).

### What does NOT count

- Questions, reactions, one-shot instructions ("run that script now")
- Situational instructions ("don't run that script right now")
- Pure reactions without a rule ("i don't get it", "this is confusing")

### Durability test

**No duration marker required** — your three canonical examples all lack `always/never/from now on`. The test is: *does the directive target a practice/requirement, not a one-shot task?*

---

## 2. Where Observed

`chat.message` hook — already reads user text for the digest. Same hook, same text, zero new plumbing.

---

## 3. What Gets Written

| Field | Value |
|---|---|
| `content` | The user's normative clause, lightly normalized |
| `applies_when` | Derived from scope words in the message, else "always in this project" |
| `memory_type` | `convention` |
| `tier` | `L1` (highest) for explicit "remember that" or reinforced; `L2` for single sighting |
| `source` | `user` (distinguishable from `tool`/`agent`) |
| `grounds` | File/symbol/git_ref named in the message, if any |
| `task_type` | `general` (or inferred from context) |
| `source` | `user` |

**Your three examples mapped:**

| You said | `content` | `applies_when` |
|---|---|---|
| use pdm and venv | use pdm and venv for Python deps | managing Python dependencies |
| use zod validators for http response validation | validate HTTP responses with zod schemas | validating HTTP responses |
| avoid using try catch | avoid try/catch; prefer the project's error idiom | writing error handling |

---

## 3. Precision Containment (three layers)

1. **Gate** — explicit "remember that" OR (corrective/mandate + generalizable target). `writeMemory` already refuses exact duplicates.
2. **Trust decay** — existing `computeStatus` archives low-trust memories after 30 days. Needs a runtime caller (currently test-only).
3. **Immediate confirmation** — after capture, inject one line:

```txt
captured as a durable rule: "avoid try/catch — use the project's error idiom"
  applies when: writing error handling
  say "forget that rule" to remove it
```

This is the safety valve: a wrong rule is removable in one breath instead of permanent.

---

## 4. Governance (pruning)

Wire the existing machinery:

- `session.idle` → call `computeStatus` + `sweepGrounds` (already fires, just needs the call)
- `session.compacted` → same
- `auto_archive_after_days: 30` + `decay_rate: 0.3` already in governance config

Low-trust memories auto-archive after 30 days. Capture without pruning fills the DB; pruning without capture does nothing. Both must land together.

---

## 5. Implementation Plan (files to change)

### A. `hooks/chat-message.ts` — add capture detector + writer

- Extract user text (already done for digest)
- Run detector on `isFirst` messages (or all messages with corrective markers)
- On match: call `writeMemoryFull` with derived fields
- Inject confirmation line into `output.parts`

### B. `hooks/session-events.ts` — add governance sweep

- `session.idle` → call `computeStatus` + `sweepGrounds`
- `session.compacted` → same

### C. `hooks/session-events.ts` — add `forget` command parser

- Detect "forget that rule" / "forget that" in user text
- Resolve to most recent captured rule (by session + recency)
- Call `setStatusFull(id, "archived")` or `deleteMemoryFull`

### D. `db/queries.ts` — add `searchMemoriesV2` (already done) + `forgetMemory` helper

- `forgetMemory(db, sessionId, ruleText)` → find by content similarity + session, archive/delete

### E. `db/schema.ts` — migration 3 (already committed)

- `memory_fts_v2` + triggers on `memory` + backfill
- `SCHEMA_VERSION = 3`

### F. `index.ts` — wire the hooks

- Ensure `chat.message` passes user text to `buildInjectionTexts` (done)
- Ensure `session.idle` / `session.compacted` call governance

---

## 6. Open Questions (need your call)

1. **Tier for single-sighting captures** — L2 (decays faster) or L1? I'd say L2, promoted on restatement.
2. **Scope of "generalizable"** — only code conventions, or also process rules ("always run tests before commit")? I'd say yes to both, same tier.
3. **Confirmation verbosity** — one line per capture, or batch at session end? One line per capture is safer (immediate undo).
4. **Ground extraction** — only explicit file/symbol mentions, or also infer from recent tool activity? Start with explicit only.

---

## 7. Implementation Order

1. **chat-message.ts** — detector + `writeMemoryFull` call + confirmation injection
2. **session-events.ts** — governance sweep on `idle`/`compacted`
3. **forget command** in `session-events.ts` + `forgetMemory` in queries
4. Wire governance calls in `index.ts` (`session.idle`/`compacted`)
5. Typecheck + test on seeded DB → sync → push

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| False positive captures | Confirmation line + trust decay + explicit "forget" command |
| Over-capture noise | Tier L2 for single sightings, L1 only on restatement |
| Governance never runs | Wire to `session.idle` (already fires) + test in pre-commit |
| Ground extraction misses | Start with explicit mentions only; infer from tool activity later |

---

## 9. Next Step

If this design looks right, I'll implement in order: A → B → C → D → E → F, with typecheck + test at each step, then sync to all 26 targets.

**Ready to start with A (chat-message capture + confirmation)?**
