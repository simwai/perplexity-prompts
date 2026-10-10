import { createConnection, getDbPath } from "./db/connection.js";
import { buildInjectionTexts, detectAndCaptureMemory, forgetInjectionState } from "./hooks/chat-message.js";
import { getSessionUserText, pruneSession, recordMessageInfo, recordPart } from "./hooks/message-events.js";
import { buildCompactionContext } from "./hooks/compacting.js";
import { handleSessionCreated, handleSessionIdle, handleForgetCommand } from "./hooks/session-events.js";
import { resolveSessionOutcome } from "./hooks/tool-execute-after.js";
import { buildSystemPrompt } from "./prompt.js";
import { IS_BUN } from "./runtime/detect.js";
import { fromAsync, isErr, isRecord } from "./core/result.js";
import type { Event } from "@opencode-ai/sdk";

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

const injectedSessions = new Set<string>();

const MemoryWorthPlugin = async ({ client, directory }: { client: any; directory: string }) => {
  const db = await createConnection(directory);
  const runtime = IS_BUN ? "bun" : "node";
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
        await handleSessionCreated(db);
        return;
      }
      if (evt.type === "session.deleted") {
        const sessionId = readSessionId(evt.properties);
        if (sessionId) {
          injectedSessions.delete(sessionId);
          forgetInjectionState(sessionId);
          pruneSession(sessionId);
        }
        return;
      }
      if (evt.type === "message.updated") {
        const info = (evt.properties as { info?: { id?: unknown; sessionID?: unknown; role?: unknown } } | undefined)?.info;
        if (info && typeof info.id === "string" && typeof info.sessionID === "string" && typeof info.role === "string") {
          recordMessageInfo({ id: info.id, sessionID: info.sessionID, role: info.role });
        }
        return;
      }
      if (evt.type === "message.part.updated") {
        const part = (evt.properties as { part?: { id?: unknown; sessionID?: unknown; messageID?: unknown; type?: unknown; text?: unknown; synthetic?: unknown; ignored?: unknown } } | undefined)?.part;
        if (part && typeof part.messageID === "string" && typeof part.sessionID === "string" && typeof part.type === "string") {
          recordPart({ id: typeof part.id === "string" ? part.id : "", sessionID: part.sessionID, messageID: part.messageID, type: part.type, text: typeof part.text === "string" ? part.text : undefined, synthetic: part.synthetic === true, ignored: part.ignored === true });
        }
        return;
      }
      if (evt.type === "session.idle") {
        const sessionId = readSessionId(evt.properties);
        if (sessionId) await handleSessionIdle(db, sessionId);
        return;
      }
      if (evt.type === "session.compacted") {
        const sessionId = readSessionId(evt.properties);
        if (sessionId) await handleSessionIdle(db, sessionId);
      }
    },

    "chat.message": async (input: { sessionID?: string; messageID?: string }, output: { parts: any[] }) => {
      const sessionId = input.sessionID;
      if (!sessionId) return;
      const isFirst = !injectedSessions.has(sessionId);
      // Upstream anomalyco/opencode#22831: output.parts is always empty live,
      // so user text comes from bus-accumulated message parts instead.
      const userText = getSessionUserText(sessionId);

      // Handle "forget that rule" command first
      const forgot = await handleForgetCommand(db, sessionId, userText);
      if (forgot) {
        const forgetText = `forgot the most recent rule`;
        const messageId = input.messageID ?? `memory-worth-${sessionId}`;
        const systemPart = { id: `memory-worth-system-${sessionId}`, sessionID: sessionId, messageID: messageId, type: "text" as const, text: buildSystemPrompt() };
        const memoryPart = { id: `memory-worth-forget-${sessionId}`, sessionID: sessionId, messageID: messageId, type: "text" as const, text: forgetText };
        output.parts.push(systemPart, memoryPart);
        return;
      }

      // messageID is stable for one user turn and doubles as the injection
      // guard, so a turn can never receive the digest twice.
      const texts = await buildInjectionTexts(db, sessionId, isFirst, userText, input.messageID);

      // Capture detection — runs on every message, not just first
      const captureResult = await detectAndCaptureMemory(db, sessionId, userText);

      const allTexts = [...texts];
      if (captureResult) {
        allTexts.push(captureResult);
      }

      if (allTexts.length === 0) return;
      injectedSessions.add(sessionId);
      const messageId = input.messageID ?? `memory-worth-${sessionId}`;
      const systemPart = { id: `memory-worth-system-${sessionId}`, sessionID: sessionId, messageID: messageId, type: "text" as const, text: buildSystemPrompt() };
      const memoryParts = allTexts.map((text, index) => ({
        id: `memory-worth-digest-${sessionId}-${index}`,
        sessionID: sessionId,
        messageID: messageId,
        type: "text" as const,
        text,
      }));
      output.parts.push(systemPart, ...memoryParts);
    },

    "tool.execute.after": async (input: { sessionID: string }, output: { output: unknown; title?: string; metadata?: unknown }) => {
      const text = typeof output.output === "string" ? output.output : "";
      await resolveSessionOutcome(db, input.sessionID, text);
    },

    "experimental.session.compacting": async (input: { sessionID: string }, output: { context: string[] }) => {
      const lines = await buildCompactionContext(db, input.sessionID);
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
    },
  };
};

export default MemoryWorthPlugin;
