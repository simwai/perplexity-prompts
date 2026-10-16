# Baba Plugin Debugging Infrastructure

All Baba plugins include a unified debug system that makes internal behavior visible, queryable, and auditable across **4 output destinations simultaneously**.

---

## Quick Start

Debug works **out of the box** — no configuration required:

```bash
opencode
```

Default behavior:

- **Console (stderr)**: All `info`/`warn`/`error` logs visible immediately
- **File (JSONL)**: On by default — writes to `%TEMP%\baba-debug.jsonl`. Override the path with `BABA_DEBUG_FILE`
- **opencode log viewer**: removed in V2 — the plugin context has no `client.app.log` surface

---

## Configuration

> **Set these as real OS environment variables, not opencode config keys.** The
> opencode config schema sets `additionalProperties: false` and declares no
> `env` property, so an `env` block in `opencode.jsonc` is silently discarded and
> never reaches `process.env`. Set them before launching opencode:
>
> ```powershell
> $env:BABA_DEBUG_LEVEL = "debug"; opencode
> ```

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `BABA_DEBUG` | `*` (all plugins) | Comma-separated plugin list, `*` for all, empty string `""` to disable |
| `BABA_DEBUG_LEVEL` | `info` | Minimum level: `debug` \| `info` \| `warn` \| `error` |
| `BABA_DEBUG_FILE` | (disabled) | Path for JSONL file output (e.g., `/tmp/baba-debug.jsonl`) |
| `BABA_DEBUG_MAX_LINES` | `10000` | On-disk rotation cap — oldest lines are trimmed past this |

### Examples

```bash
# All plugins, debug level, with file output
BABA_DEBUG=* BABA_DEBUG_LEVEL=debug BABA_DEBUG_FILE=/tmp/baba.jsonl opencode

# Specific plugins only
BABA_DEBUG=baba-lock-enforce,baba-prompt-system-loader opencode

# Disable entirely
BABA_DEBUG="" opencode

# Production: warn+ only, file output
BABA_DEBUG=* BABA_DEBUG_LEVEL=warn BABA_DEBUG_FILE=/var/log/baba.jsonl opencode
```

---

## Output Destinations

### 1. Console (stderr) — Always On

Structured single-line format:

```text
[baba-lock-enforce] WARN: lock contention detected, blocking write {"session":"abc123","filePath":"src/foo.ts","owner":"session-xyz"}
[adaptive-temperature] INFO: feedback applied {"session":"abc123","reasoning":"too random","prevTemperature":0.7,"newTemperature":0.6}
```

### 2. opencode Log Viewer — Removed in V2

**This destination no longer exists.** V1 called `client.app.log()`, which the
opencode UI surfaced under **Logs → Service: plugin-name**. The V2 plugin
context has no `client.app.log` surface, so nothing is sent to it and the UI
viewer shows nothing for these plugins. Use the console or the JSONL file
instead.

### 3. File (JSONL) — On by default

Writes to `%TEMP%\baba-debug.jsonl` with no configuration. Override the path
with the `BABA_DEBUG_FILE` OS environment variable.

Each line is valid JSON:

```json
{"ts":"2026-10-11T15:19:30.537Z","plugin":"file-test","level":"info","msg":"file output test","meta":{"writtenTo":"C:\\Users\\Simon\\AppData\\Local\\Temp\\baba-debug-test.jsonl"}}
{"ts":"2026-10-11T15:19:30.538Z","plugin":"baba-lock-enforce","level":"warn","msg":"lock contention detected","meta":{"session":"abc123","filePath":"src/foo.ts","owner":"session-xyz"}}
```

Query with `jq`:

```bash
# All warnings/errors
jq 'select(.level=="warn" or .level=="error")' baba-debug.jsonl

# Specific plugin
jq 'select(.plugin=="baba-lock-enforce")' baba-debug.jsonl

# Specific session
jq 'select(.meta.session=="abc123")' baba-debug.jsonl
```

### 4. Debug Tools — Programmatic Inspection

Every plugin exposes a `baba_<plugin>_debug` tool callable from the model:

```text
# Dump lock state
baba_lock_enforce_debug { "action": "liveLocks" }

# Dump session titles
opencode_autotitle_debug { "action": "sessions" }

# Dump convention review states
baba_convention_review_debug { "action": "sessions" }
```

**Common actions:**

| Plugin | Actions |
|--------|---------|
| `baba-lock-enforce` | `state`, `liveLocks`, `config` |
| `baba-prompt-system-loader` | `state`, `sessions` |
| `baba-protocol-enforce` | `state`, `sessions`, `protocols` |
| `baba-bootstrap` | `state`, `delivered` |
| `baba-system-reminder-override` | `state`, `markers`, `override` |
| `multi-model-consensus` | `state`, `enabled`, `lastTool` |
| `opencode-autotitle` | `state`, `config`, `sessions` |
| `memory-worth` | `state`, `stats`, `recent` |
| `adaptive-temperature` | `state`, `config`, `sessions` |

---

## Log Levels

| Level | When Used | Visible by Default |
|-------|-----------|-------------------|
| `debug` | Verbose internal state, every function call, detailed flow | ❌ (use `BABA_DEBUG_LEVEL=debug`) |
| `info` | Key events: initialization, phase transitions, tool invocations, completions | ✅ |
| `warn` | Recoverable issues: contention, failed deliveries, missing files, fallbacks | ✅ |
| `error` | Failures: blocked operations, exceptions, unavailable resources | ✅ |

---

## Session Metadata

Every log entry includes structured `meta`:

```json
{
  "session": "abc123-def456",
  "filePath": "src/foo.ts",
  "owner": "session-xyz",
  "lockPath": ".session-locks/src--foo.ts.lock",
  "dependencies": ["src/bar.ts"],
  "phase": "PLAN",
  "reasoning": "too random"
}
```

**Standard fields:**

- `session` — opencode session ID (always present when available)
- `phase` — Current Baba phase (STARTUP, CHECKLIST, REVIEW, PLAN, PATCH, DRIFT)
- `tool` / `command` — Tool or command that triggered the log
- Plugin-specific fields (see per-plugin sections below)

---

## Per-Plugin Debug Reference

### adaptive-temperature

| Event | Level | Meta |
|-------|-------|------|
| Plugin init | info | config (min/max/default temp, topP) |
| Feedback applied | info | session, reasoning, prev/new temperature, prev/new topP |
| Feedback command received | debug | session, feedback text |
| System transform | debug | session, current settings |
| Chat.params injection | debug | session, injected temperature, topP |
| Session cleanup | debug | session |

### baba-bootstrap

| Event | Level | Meta |
|-------|-------|------|
| Plugin init | info | — |
| session.created | debug | session |
| session.prompt delivery success | info | session |
| session.prompt delivery failed | warn | session, error |
| Fallback disabled (FK constraint) | debug | session |
| Session cleanup | debug | session |

### baba-system-reminder-override

| Event | Level | Meta |
|-------|-------|------|
| Plugin init | info | markers, overrideLength |
| Reminder replaced | info | originalBlocks, replacedCount |

### multi-model-consensus

| Event | Level | Meta |
|-------|-------|------|
| Plugin init | info | config (kiloBaseUrl, flashModel, ultraModel, timeouts) |
| consensus_review invoked | debug | session, promptLength, originalLength |
| Consensus disabled | debug | session |
| Skipped (recent tool use) | debug | session |
| Consensus started | info | session, models |
| Single model succeeded | warn | session, model |
| Judge merge | debug | session, judgeModel |
| Judge merge failed | warn | session, error |
| /consensus command | debug | session, arg |
| Mode enabled/disabled | info | session |
| System transform | debug | session, state |
| Tool use tracking | debug | session, tool |
| Session cleanup | debug | session |

### memory-worth

| Event | Level | Meta |
|-------|-------|------|
| Plugin init | debug | runtime, dbPath |
| session.created | debug | n/a |
| session.deleted | debug | sessionId |
| session.idle | debug | sessionId |
| session.compacted | debug | sessionId |
| prompt hook | debug | sessionId, userTextLength |
| Forget command | info | sessionId |
| detectAndCaptureMemory | debug | sessionId |
| tool.execute.after | debug | sessionId, outputLength |
| session.compacting | debug | sessionId, linesCount |

### baba-prompt-system-loader

| Event | Level | Meta |
|-------|-------|------|
| Plugin init | info | directory |
| session.created | debug | session, requiredCount |
| Prompt-system file loaded | debug | session, file, loadedCount, requiredCount |
| PLAN v1→v2 transition | info | session |
| Output blocked | warn | session, phase, missingCount, missingFiles |

### baba-protocol-enforce

| Event | Level | Meta |
|-------|-------|------|
| Plugin init | info | directory, phaseTransitions |
| git remote -v blocked | debug | command |
| git remote get-url blocked | warn | command |
| git push sanitized | debug | command |
| Session created | info | session, phase |
| Session deleted | debug | session |
| Phase transition | info | session, from, to |
| REVIEW→PLAN transition | info | session |
| Protocol checks failed | warn | session, phase, failed[] |

### baba-lock-enforce

| Event | Level | Meta |
|-------|-------|------|
| Plugin init | debug | directory, lockTtlMinutes, writeTools, readOnlyHost |
| acquire_lock invoked | debug | session, filePath, dependencies |
| Lock acquired | info | session, filePath, flatName |
| acquire_lock failed | warn | session, error |
| acquire_lock blocked | warn | session, filePath, owner |
| release_lock invoked | debug | filePath |
| Lock released | info | filePath |
| release_lock failed | warn | filePath, reason |
| check_lock invoked | debug | session, filePath |
| check_lock: no lock | debug | session, filePath |
| check_lock: lock found | debug | session, filePath, owner |
| Write contention check | debug | session, filePath, tool |
| Contention detected (blocked) | warn | session, filePath, owner, lockPath, dependencies |

### opencode-autotitle

| Event | Level | Meta |
|-------|-------|------|
| Plugin init | info | config, cheapModelPatterns |
| Keyword title set | info | fullTitle |
| AI title set | info | fullTitle |
| Session idle / title gen | debug | session, userPreview, assistantPreview |
| Model selected | debug | providerID/modelID |
| Custom title detected | debug | session, title |

---

## Troubleshooting

### No logs appearing?

```bash
# Check if plugin loaded
grep "plugin initialized" /tmp/baba-debug.jsonl

# Verify plugin name matches BABA_DEBUG filter
BABA_DEBUG=* BABA_DEBUG_LEVEL=debug opencode 2>&1 | head -20
```

### File not created?

- The file destination is on by default — check the path first: `%TEMP%\baba-debug.jsonl`
- `BABA_DEBUG_LEVEL=info` (the default) suppresses every `debug` line, so an
  empty-looking file usually means level filtering, not a broken sink. Run with
  `BABA_DEBUG_LEVEL=debug` to see `plugin initialized`
- Confirm `BABA_DEBUG` is not set to `""` — that disables logging entirely
- Path must be writable by the opencode process
- Windows: use a real path like `C:\temp\baba.jsonl`, not `/tmp/`

### Too much noise?

```bash
# Reduce to warn+ only
BABA_DEBUG_LEVEL=warn opencode

# Filter to specific plugin
BABA_DEBUG=baba-lock-enforce opencode
```

### Missing session IDs?

- Session IDs come from the session context: `event.sessionID` on hooks, and `event.data.sessionID` on bus events
- Some early hooks may not have it yet, and the event bus shape changed between V1 and V2

## V1 vs V2 event source

| What | V1 | V2 |
|---|---|---|
| Session id on a bus event | `event.properties.sessionID` | `event.data.sessionID` |
| Session id on a hook | `input.sessionID` | `event.sessionID` |
| User message text | bus accumulation (empty `output.parts`) | `event.prompt` on the prompt hook |
| `message.updated` / `message.part.updated` | existed | **removed** |
| Subscription shape | a callback | an async iterable |

---

## Adding Debug to New Plugins

OpenCode Desktop runs 1.19.0, which is the **V2** plugin API. New plugins must
use the V2 entrypoint; the V1 shape below will not load.

```typescript
import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

export default Plugin.define({
  id: "my-new-plugin",

  setup(ctx) {
    // V2 has no client.app.log, so the logger gets no client. Console and
    // JSONL-file destinations still work.
    const log = createDebug("my-new-plugin");

    void log.debug("plugin initialized", { directory: ctx.location.directory });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "my_new_plugin_debug",
        description: "Debug my-new-plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "config"],
              default: "state",
              description: "What to dump",
            },
          },
        },
        async execute(input: unknown) {
          const action = readAction(input);
          void action;
          await log.stateDump("my-new-plugin", {
            config: { customConfig: "value" },
          });
          return { output: "State dumped to debug outputs" };
        },
      });
    });

    void ctx.tool.hook("execute.after", async (event) => {
      await log.debug("tool executed", { tool: event.tool, session: event.sessionID });
    });

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      // The session id moved to event.data under V2.
      await log.debug("event", { type: event.type });
    });

    return () => { /* cleanup */ };
  },
});
```

**Required patterns:**

1. `Plugin.define({ id, setup })` from `@opencode/plugin` -- the V1 default
   async-function export does not load under V2
2. `createDebug(pluginName)` with no client -- V2 has no `client.app.log`
3. Register tools with `ctx.tool.transform`; schemas are **JSON Schema**, not Zod
4. `execute` args arrive as `unknown`; narrow them, never cast to `any`
5. `execute` returns `{ output: string }`, not a bare string
6. Read the session id from `event.data.sessionID`, not `event.properties`
7. `$` (Bun shell) is not on the V2 context -- use `node:fs/promises`

8. `const log = createDebug("plugin-name", client)` at factory start
9. `await log.debug("plugin initialized", { config })` immediately after
10. Use `log.debug/info/warn/error` at all key decision points
11. Add `baba_<plugin>_debug` tool with `stateDump`
12. Include `session` in meta whenever available

---

## Integration with opencode

### Viewing logs in opencode UI

1. Open opencode
2. Navigate to **Logs** tab
3. Filter by **Service** = plugin name (e.g., `baba-lock-enforce`)
4. Filter by **Level** = warn/error for issues

### Programmatic access

```bash
# Tail live JSONL
tail -f /tmp/baba-debug.jsonl | jq '.'

# Search for contention events
jq 'select(.msg | contains("contention"))' /tmp/baba-debug.jsonl

# Timeline for a session
jq 'select(.meta.session=="abc123") | .ts + " " + .level + " " + .msg' /tmp/baba-debug.jsonl
```

---

## Philosophy

> **Debug is not optional.** Every plugin behavior is visible by default. The system is designed so that:
>
> - Production runs at `info` level (key events only)
> - Development runs at `debug` level (full trace)
> - Issues are reproducible via `stateDump` tools
> - No "works on my machine" — logs are structured and portable

The debug system replaces ad-hoc `console.log` with a consistent, filterable, multi-destination observability layer that works the same way across all 13 Baba plugins.
