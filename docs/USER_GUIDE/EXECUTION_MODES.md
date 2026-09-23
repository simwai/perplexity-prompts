# ⚙️ EXECUTION MODES

> 💡 **AUTO, DIRECT, STRUCTURED** — How the agent chooses and you can override.

---

## 🎯 Mode Selection

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor': '#a855f7', 'primaryTextColor': '#fafafa',
  'primaryBorderColor': '#c084fc', 'lineColor': '#c084fc',
  'secondaryColor': '#7e22ce', 'tertiaryColor': '#581c87',
  'background': '#0f0f0f', 'mainBkg': '#1a1a1a',
  'secondBkg': '#262626', 'tertiaryBkg': '#3d3d3d',
  'textColor': '#fafafa', 'nodeBorder': '#a855f7',
  'clusterBkg': '#2d1b4e', 'clusterBorder': '#a855f7'
}}}%%
flowchart TD
    REQUEST[User Request] --> AUTO{AUTO\n(default)}
    AUTO -->|Concrete, low-blast-radius| DIRECT
    AUTO -->|Risky, ambiguous, broad| STRUCTURED
    
    DIRECT --> D1[Read target in full]
    DIRECT --> D2[Apply style defaults]
    DIRECT --> D3[Edit + lint per step]
    DIRECT --> D4[Verify diff + checks]
    DIRECT --> D5[Commit/push gate]
    
    STRUCTURED --> S1[CHECKLIST]
    S1 --> S2[DOCS?]
    S2 -->|Yes| S3[DOCS]
    S2 -->|No| S4[REVIEW]
    S3 --> S4
    S4 --> S5[PLAN]
    S5 --> S6[PATCH]
    S6 --> S7[DRIFT?]
    
    style AUTO fill:#2d1b4e,stroke:#a855f7
    style DIRECT fill:#1a1a1a,stroke:#4ade80
    style STRUCTURED fill:#1a1a1a,stroke:#fbbf24
```

---

## 🟢 DIRECT Mode

**For:** Clear, low-blast-radius requests.

### Triggers (Auto)
- Read-only explanation / repo question
- One-file typo, formatting, rename, obvious local fix
- Small config/test adjustment with clear expected result
- Running command, inspecting diff, checking status

### Behavior
- `[MODE: DIRECT]` header (no phase templates)
- Reads target file **in full** before editing
- Applies `05-impl-style.md` defaults + local conventions
- Per-edit lint gate (formatter → linter → manual fixes)
- Inspects final diff, runs project checks
- Commit/push gate if edits made

### Safety Constraints
- Never for: security, auth, secrets, migrations, new deps, public APIs, architecture, broad multi-file, unclear requirements
- If unsure → agent explains why DIRECT unsafe, asks to confirm or switch to STRUCTURED

---

## 🟣 STRUCTURED Mode

**For:** Risky, ambiguous, broad, or version-sensitive work.

### Full Phase Flow
```
CHECKLIST → DOCS (if needed) → REVIEW → PLAN → PATCH → [DRIFT]
```

### Key Gates
| Gate | Phase | Requirement |
|---|---|---|
| Checklist complete | CHECKLIST | All checkboxes ticked (inventory + H/S/L coverage) |
| Docs evidence | DOCS | Version/URL/impact recorded for each in-scope dep |
| Confirmation | REVIEW | User confirms accepted/disputed violations + constraints |
| Plan approval | PLAN | Explicit user approval + complete rewrite contract |
| Verification | PATCH | Compliance audit + constraint verification + lint + checks + Plan-Actual |
| Commit/Push | PATCH | User decision (A/B/C) before any git ops |

### Persona Flow
```
BabaSensei (CHECKLIST→PLAN) → HANDOFF
BabaTester (REVIEW→TEST_STRATEGY) → HANDOFF
BabaDev (PLAN→PATCH)
```

---

## 🔵 AUTO Mode (Default)

**Agent chooses** based on task signals:

| Signal | Choice |
|---|---|
| Concrete target, obvious fix | DIRECT |
| Security/auth/secrets/migrations | STRUCTURED |
| New deps, framework/API changes | STRUCTURED |
| Public interfaces, architecture | STRUCTURED |
| Broad multi-file, unclear blast radius | STRUCTURED |
| Ambiguous goals, missing constraints | STRUCTURED |

**Conflict rule:** When signals conflict → STRUCTURED (safer).

---

## 🎮 Manual Override Commands

| Command | Effect |
|---|---|
| `/direct` | Force DIRECT (if safe) |
| `/structured` | Force STRUCTURED |
| `/auto` | Return to AUTO selection |
| `/phase <NAME>` | Declare active phase (STRUCTURED only) |

**In OpenCode:** Commands persist mode in session state.

---

## 📋 Mode Comparison

| Aspect | DIRECT | STRUCTURED |
|---|---|---|
| Phase templates | ❌ (`[MODE: DIRECT]`) | ✅ (`[PHASE: X]`) |
| Plan approval | ❌ (implicit) | ✅ (explicit, gated) |
| Rewrite contract | ❌ | ✅ (mandatory) |
| Review findings | ❌ | ✅ (rubric-scored) |
| Lint per edit | ✅ | ✅ |
| Diff inspection | ✅ | ✅ |
| Project checks | ✅ | ✅ |
| Commit/push gate | ✅ | ✅ |
| Persona handoffs | ❌ | ✅ |
| Drift detection | Optional | ✅ (post-patch) |

---

## 🛡️ Safety Notes

### DIRECT Does NOT Bypass
- Security review (if security-related → STRUCTURED)
- Per-edit lint gate (mandatory)
- Local convention preservation
- Commit/push gate (if edits made)

### STRUCTURED Guarantees
- No PATCH without approved PLAN
- No PLAN without confirmed REVIEW
- No REVIEW without complete CHECKLIST
- No analysis without Reading Verification (100%)
- No commit without user decision

---

## 📚 Related

- Phase flow: `USER_GUIDE/PHASES.md`
- Phase templates: `prompt-system/03-output-and-state.md`
- Execution mode rules: `prompt-system/00-system.md`
- Style defaults: `REFERENCE/IMPLEMENTATION_STYLE.md`
- Patch protocol: `REFERENCE/PATCH_PROTOCOL.md`