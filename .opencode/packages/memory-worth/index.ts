/**
 * Memory Worth plugin (V2)
 *
 * Persistent agent memory with trust signals, invalidation, and self-tuning.
 *
 * V2 changes:
 *   - `export default Plugin.define({ id, setup })` replaces the V1 function
 *     export, and the 12 tool definitions are converted from Zod args to JSON
 *     Schema by tools/v2-register.ts.
 *   - `chat.message` became `ctx.session.hook("prompt")`.
 *   - `tool.execute.after` became `ctx.tool.hook("execute.after")`, with the
 *     tool output now at `event.result`.
 *   - `experimental.session.compacting` became `ctx.session.hook("compaction")`.
 *   - The V2 event bus has no `message.updated` or `message.part.updated`, which
 *     are what fed the in-memory text accumulation. The prompt hook now records
 *     the user text directly, so `getSessionUserText` keeps working.
 *   - `client.app.log()` does not exist on the V2 context, so the startup log
 *     line is dropped and the debug logger is built without a client.
 */

import { createConnection, getDbPath } from "./db/connection.js";
import { detectAndCaptureMemory, forgetInjectionState } from "./hooks/chat-message.js";
import { getSessionUserText, pruneSession, recordMessageInfo, recordPart } from "./hooks/message-events.js";
import { buildCompactionContext } from "./hooks/compacting.js";
import { handleSessionCreated, handleSessionIdle, handleForgetCommand } from "./hooks/session-events.js";
import { resolveSessionOutcome } from "./hooks/tool-execute-after.js";
import { IS_BUN } from "./runtime/detect.js";
import { isRecord } from "./core/result.js";
import { Plugin } from "@opencode/plugin";
import { createDebug } from "../../lib/baba-debug";
import { subscribeToEvents } from "../../lib/baba-session-id";
import {
  memoryDeleteTool,
  memoryGetTool,
  memoryInvalidateTool,
  memoryMergeTool,
  memorySearchTool,
  memorySetStatusTool,
  memoryStatsTool,
  memorySynthesizeTool,
  memoryTuneTool,
  memoryUpdateTool,
  memoryWakeupTool,
  memoryWriteTool,
} from "./tools/index.js";
import { toV2Tool, type LegacyToolDefinition, type ToolAdder } from "./tools/v2-register.js";

/** Extracts the argument text from a V2 prompt invocation. */
function readPromptText(prompt: unknown): string {
  if (!isRecord(prompt)) return "";
  if (typeof prompt.text === "string") return prompt.text;
  if (Array.isArray(prompt.parts)) {
    return prompt.parts
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .filter((text) => text.length > 0)
      .join("\n");
  }
  return "";
}

/** V2 moved the event payload from `properties` to `data`. */
function readDataString(event: Record<string, unknown>, key: string): string | undefined {
  const data = event.data;
  if (!isRecord(data)) return undefined;
  const value = data[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const LEGACY_TOOLS: Record<string, LegacyToolDefinition> = {
  memory_search: memorySearchTool,
  memory_get: memoryGetTool,
  memory_synthesize: memorySynthesizeTool,
  memory_wakeup: memoryWakeupTool,
  memory_write: memoryWriteTool,
  memory_update: memoryUpdateTool,
  memory_invalidate: memoryInvalidateTool,
  memory_merge: memoryMergeTool,
  memory_delete: memoryDeleteTool,
  memory_set_status: memorySetStatusTool,
  memory_stats: memoryStatsTool,
  memory_tune: memoryTuneTool,
};

export default Plugin.define({
  id: "memory-worth",

  async setup(ctx) {
    const directory = ctx.location.directory;
    // setup is async, so the connection is opened before anything registers.
    const db = await createConnection(directory);
    const runtime = IS_BUN ? "bun" : "node";
    const log = createDebug("memory-worth");

    await log.debug("plugin initialized", { runtime, dbPath: getDbPath(directory) });

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      const record = event as Record<string, unknown>;
      const type = record.type;

      if (type === "session.created") {
        await log.debug("session.created event", {});
        await handleSessionCreated(db);
        return;
      }

      const sessionId = readDataString(record, "sessionID");

      if (type === "session.deleted") {
        if (sessionId) {
          await log.debug("session.deleted event, cleaning up", { sessionId });
          forgetInjectionState(sessionId);
          pruneSession(sessionId);
        }
        return;
      }

      if (type === "session.idle") {
        if (sessionId) {
          await log.debug("session.idle event", { sessionId });
          await handleSessionIdle(db, sessionId);
        }
        return;
      }

      if (type === "session.compacted" && sessionId) {
        await log.debug("session.compacted event", { sessionId });
        await handleSessionIdle(db, sessionId);
      }
    });

    void ctx.tool.transform((editor: ToolAdder) => {
      for (const [name, legacy] of Object.entries(LEGACY_TOOLS)) {
        editor.add(toV2Tool(name, legacy, { directory }));
      }

      editor.add({
        name: "memory_worth_debug",
        description: "Debug memory-worth plugin: dump internal state or run diagnostic queries.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "stats", "recent"],
              default: "state",
              description:
                "What to dump: state (plugin state), stats (database stats), recent (recent memories)",
            },
          },
        },
        async execute() {
          await log.stateDump("memory-worth", {
            runtime,
            dbPath: getDbPath(directory),
            // Note: internal state lives in the hooks modules, not here.
          });
          return { output: "State dumped to debug outputs (console, file)" };
        },
      });
    });

    // Replaces the V1 chat.message hook. The V2 bus no longer delivers
    // message.updated / message.part.updated, so the user text those events fed
    // into getSessionUserText is recorded here instead.
    void ctx.session.hook("prompt", async (event) => {
      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;

      const userText = readPromptText(event.prompt);
      await log.debug("prompt hook", { sessionId, userTextLength: userText.length });

      if (userText && !getSessionUserText(sessionId)) {
        recordMessageInfo({ id: `msg_${sessionId}`, sessionID: sessionId, role: "user" });
        recordPart({
          id: `part_${sessionId}`,
          sessionID: sessionId,
          messageID: `msg_${sessionId}`,
          type: "text",
          text: userText,
          synthetic: false,
          ignored: false,
        });
      }

      const forgot = await handleForgetCommand(db, sessionId, userText);
      if (forgot) {
        await log.info("forget command handled", { sessionId });
        // Forget writes to the DB; nothing is injected, to avoid the FOREIGN KEY
        // constraint on synthetic message ids.
        return;
      }

      await log.debug("running detectAndCaptureMemory", { sessionId });
      await detectAndCaptureMemory(db, sessionId, userText);
      // Memory injection into parts was removed under V1 for the same FK reason;
      // the model reaches memory through the memory_* tools instead.
    });

    void ctx.tool.hook("execute.after", async (event) => {
      if (event.status !== "completed") return;
      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;

      const result = event.result as { output?: unknown };
      const text = typeof result?.output === "string" ? result.output : "";
      await log.debug("tool.execute.after hook", { sessionId, outputLength: text.length });
      await resolveSessionOutcome(db, sessionId, text);
    });

    void ctx.session.hook("compaction", async (event) => {
      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;

      await log.debug("session.compacting hook", { sessionId });
      const lines = await buildCompactionContext(db, sessionId);
      await log.debug("compaction context built", { sessionId, linesCount: lines.length });
      if (lines.length === 0) return;

      // V2's compaction event has no `context` array (it exposes `result`), so
      // the lines are folded into the summary. The array branch stays for
      // forward compatibility if opencode reintroduces it.
      const injected = lines.join("\n");
      const record = event as unknown as {
        context?: unknown;
        result?: { summary?: unknown } | undefined;
      };

      if (Array.isArray(record.context)) {
        record.context.push(...lines);
        return;
      }

      if (!record.result) record.result = {};
      const existing = typeof record.result.summary === "string" ? record.result.summary : "";
      record.result.summary = existing ? `${existing}\n${injected}` : injected;
    });

    return () => {
      // The libsql connection is process-scoped and outlives plugin reload.
    };
  },
});