/**
 * Auto-First-Message Plugin for opencode (V2)
 *
 * Delivers the session-start reminder exactly once per session.
 *
 * V2 change: the V1 `client.session.prompt({ noReply: true })` path is gone --
 * V2's prompt input has no noReply flag, and the V1 fallback injection was
 * already disabled by a FOREIGN KEY constraint on fabricated message ids.
 * The V2-native route is the `context` session hook: append the reminder to
 * the system prompt on the first model request. That needs no fabricated
 * message id and no extra LLM turn.
 *
 * Enforcement is NOT this plugin's job. baba-prompt-system-loader already
 * holds assistant output until the required prompt-system files are read.
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

const FIRST_MESSAGE = `# Session Start Reminder

Before you do anything else, you MUST:

1. **Read AGENTS.md in full** -- This is the sole entry point for the Baba prompt system
2. **Follow all instructions 1:1** -- No deviations, no shortcuts

The system will not function correctly if you skip this step. The STARTUP phase in 00-system.md requires you to:
- Read prompt-system/00-system.md in full (no chunking)
- Load every file in the load order in full (no chunking)
- Record completion in session context

Do not respond to the user or take any action until this is complete.`;

/** Sessions that still owe the reminder. */
const pending = new Set<string>();
/** Sessions already carrying the reminder, whichever path delivered it. */
const delivered = new Set<string>();

export default Plugin.define({
  id: "baba-bootstrap",

  setup(ctx) {
    const log = createDebug("baba-bootstrap");

    void log.debug("plugin initialized");

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      const sessionId = readSessionId(event);
      if (!sessionId) return;

      if (event.type === "session.created") {
        pending.delete(sessionId);
        delivered.delete(sessionId);
        pending.add(sessionId);
        void log.debug("session.created, reminder queued", { session: sessionId });
        return;
      }

      if (event.type === "session.deleted") {
        void log.debug("session deleted, cleaning up", { session: sessionId });
        pending.delete(sessionId);
        delivered.delete(sessionId);
      }
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "baba_bootstrap_debug",
        description: "Debug baba-bootstrap plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "delivered"],
              default: "state",
              description: "What to dump: state (all), delivered (delivered sessions only)",
            },
          },
        },
        async execute(input: unknown) {
          const action = readStringField(input, "action") ?? "state";
          if (action === "delivered") {
            return { output: JSON.stringify({ delivered: [...delivered] }, null, 2) };
          }
          return {
            output: JSON.stringify(
              { deliveredCount: delivered.size, pendingCount: pending.size, delivered: [...delivered] },
              null,
              2,
            ),
          };
        },
      });
    });

    // First model request for a session carries the reminder, exactly once.
    void ctx.session.hook("context", async (event) => {
      const sessionId = readSessionId(event);
      if (!sessionId || delivered.has(sessionId) || !pending.has(sessionId)) return;

      delivered.add(sessionId);
      pending.delete(sessionId);

      if (!Array.isArray(event.system)) return;
      event.system = [...event.system, { type: "text", text: FIRST_MESSAGE }];

      void log.info("session-start reminder injected", { session: sessionId });
    });

    return () => {
      pending.clear();
      delivered.clear();
    };
  },
});

function readSessionId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return undefined;
  const id = (data as Record<string, unknown>).sessionID;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function readStringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}