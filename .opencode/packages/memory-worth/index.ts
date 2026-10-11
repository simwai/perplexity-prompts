import { createConnection, getDbPath } from "./db/connection.js";
import { detectAndCaptureMemory, forgetInjectionState } from "./hooks/chat-message.js";
import { getSessionUserText, pruneSession, recordMessageInfo, recordPart } from "./hooks/message-events.js";
import { buildCompactionContext } from "./hooks/compacting.js";
import { handleSessionCreated, handleSessionIdle, handleForgetCommand } from "./hooks/session-events.js";
import { resolveSessionOutcome } from "./hooks/tool-execute-after.js";
import { IS_BUN } from "./runtime/detect.js";
import { fromAsync, isErr, isRecord } from "./core/result.js";
import type { Event } from "@opencode-ai/sdk";
import { createDebug } from "../lib/baba-debug";
import { tool } from "@opencode-ai/plugin";

interface SessionEvent { type: string; properties?: { sessionID?: string } }
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

function readSessionId(properties: unknown): string | undefined {
  if (!isRecord(properties) || !("sessionID" in properties)) return undefined;
  const value = properties["sessionID"];
  return typeof value === "string" ? value : undefined;
}

const MemoryWorthPlugin = async ({ client, directory }: { client: any; directory: string }) => {
  const db = await createConnection(directory);
  const runtime = IS_BUN ? "bun" : "node";
  const log = createDebug("memory-worth", client);

  await log.debug("plugin initialized", { runtime, dbPath: getDbPath(directory) });

  const logged = await fromAsync(() =>
    client.app.log({
      body: {
        service: "memory-worth",
        level: "info",
        message: `memory-worth ready on ${runtime} with database at ${getDbPath(directory)}`,
      },
    }),
  );
  if (isErr(logged)) {
    // logging is best-effort and must not break plugin startup
  }

  return {
    event: async ({ event }: { event: Event }) => {
      const evt = event as SessionEvent;
      if (evt.type === "session.created") {
        await log.debug("session.created event", {});
        await handleSessionCreated(db);
        return;
      }
      if (evt.type === "session.deleted") {
        const sessionId = readSessionId(evt.properties);
        if (sessionId) {
          await log.debug("session.deleted event, cleaning up", { sessionId });
          forgetInjectionState(sessionId);
          pruneSession(sessionId);
        }
        return;
      }
      if (evt.type === "message.updated") {
        const info = (evt.properties as { info?: { id?: unknown; sessionID?: unknown; role?: unknown } } | undefined)?.info;
        if (info && typeof info.id === "string" && typeof info.sessionID === "string" && typeof info.role === "string") {
          await log.debug("message.updated event", { sessionId: info.sessionID, messageId: info.id, role: info.role });
          recordMessageInfo({ id: info.id, sessionID: info.sessionID, role: info.role });
        }
        return;
      }
      if (evt.type === "message.part.updated") {
        const part = (evt.properties as { part?: { id?: unknown; sessionID?: unknown; messageID?: unknown; type?: unknown; text?: unknown; synthetic?: unknown; ignored?: unknown } } | undefined)?.part;
        if (part && typeof part.messageID === "string" && typeof part.sessionID === "string" && typeof part.type === "string") {
          await log.debug("message.part.updated event", { sessionId: part.sessionID, messageId: part.messageID, partType: part.type, textLength: part.text?.length ?? 0 });
          recordPart({ id: typeof part.id === "string" ? part.id : "", sessionID: part.sessionID, messageID: part.messageID, type: part.type, text: typeof part.text === "string" ? part.text : undefined, synthetic: part.synthetic === true, ignored: part.ignored === true });
        }
        return;
      }
      if (evt.type === "session.idle") {
        const sessionId = readSessionId(evt.properties);
        if (sessionId) {
          await log.debug("session.idle event", { sessionId });
          await handleSessionIdle(db, sessionId);
        }
        return;
      }
      if (evt.type === "session.compacted") {
        const sessionId = readSessionId(evt.properties);
        if (sessionId) {
          await log.debug("session.compacted event", { sessionId });
          await handleSessionIdle(db, sessionId);
        }
      }
    },

    "chat.message": async (input: { sessionID?: string; messageID?: string }, output: { parts: any[] }) => {
      const sessionId = input.sessionID;
      if (!sessionId) return;
      // Upstream anomalyco/opencode#22831: output.parts is always empty live,
      // so user text comes from bus-accumulated message parts instead.
      const userText = getSessionUserText(sessionId);

      await log.debug("chat.message hook", { sessionId, userTextLength: userText.length });

      // Handle "forget that rule" command first — writes to DB, no injection
      const forgot = await handleForgetCommand(db, sessionId, userText);
      if (forgot) {
        await log.info("forget command handled", { sessionId });
        // Forget command handled; no parts injected to avoid FK constraint on synthetic message IDs
        return;
      }

      // Capture detection — runs on every message, writes directly to DB
      await log.debug("running detectAndCaptureMemory", { sessionId });
      await detectAndCaptureMemory(db, sessionId, userText);
      // NOTE: Memory injection into output.parts removed due to FOREIGN KEY constraint:
      // injected parts used synthetic message IDs (msg_memory_worth_*) that don't exist
      // in the message table. LLM accesses memory via tools (memory_search, etc.) instead.
    },

    "tool.execute.after": async (input: { sessionID: string }, output: { output: unknown; title?: string; metadata?: unknown }) => {
      const text = typeof output.output === "string" ? output.output : "";
      await log.debug("tool.execute.after hook", { sessionId: input.sessionID, outputLength: text.length });
      await resolveSessionOutcome(db, input.sessionID, text);
    },

    "experimental.session.compacting": async (input: { sessionID: string }, output: { context: string[] }) => {
      await log.debug("session.compacting hook", { sessionId: input.sessionID });
      const lines = await buildCompactionContext(db, input.sessionID);
      await log.debug("compaction context built", { sessionId: input.sessionID, linesCount: lines.length });
      for (const line of lines) {
        output.context.push(line);
      }
    },

    tool: {
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

      memory_worth_debug: tool({
        description: "Debug memory-worth plugin: dump internal state or run diagnostic queries.",
        args: {
          action: tool.schema
            .enum(["state", "stats", "recent"])
            .default("state")
            .describe("What to dump: state (plugin state), stats (database stats), recent (recent memories)"),
        },
        async execute(args) {
          const action = args.action ?? "state";
          switch (action) {
            case "stats": {
              // This would need a db query - for now return placeholder
              return JSON.stringify({ message: "stats action requires db query implementation" }, null, 2);
            }
            case "recent": {
              return JSON.stringify({ message: "recent action requires db query implementation" }, null, 2);
            }
            case "state":
            default: {
              await log.stateDump("memory-worth", {
                runtime: IS_BUN ? "bun" : "node",
                dbPath: getDbPath(directory),
                // Note: internal state is in hooks modules, not directly accessible here
              });
              return "State dumped to debug outputs (console, file, client.app.log)";
            }
          }
        },
      }),
    },
  };
};

export default MemoryWorthPlugin;
