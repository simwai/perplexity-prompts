import { createConnection, closeConnection } from "./db/connection.js";
import { getTuningParams } from "./db/queries.js";
import { handleSessionCreated, handleSessionUpdated } from "./hooks/session-events.js";
import { handleCompacting } from "./hooks/compacting.js";
import { injectMemories } from "./hooks/chat-message.js";
import { recordOutcome, classifyOutcome, isOutcomeSignal } from "./hooks/tool-execute-after.js";
import { memorySearchTool, memoryGetTool, memoryWriteTool, memoryUpdateTool, memoryInvalidateTool, memoryMergeTool, memoryDeleteTool, memorySetStatusTool, memoryStatsTool, memoryTuneTool, memorySynthesizeTool, memoryWakeupTool } from "./tools/index.js";
import type { Plugin } from "@opencode-ai/plugin";

const MemoryWorthPlugin: Plugin = async ({ client, $, directory }) => {
  const db = await createConnection(directory);

  return {
    event: async ({ event }) => {
      const eventType = event.type;

      if (eventType === "session.created") {
        await handleSessionCreated(db);
        return;
      }

      if (eventType === "session.updated") {
        await handleSessionUpdated(db, event as Parameters<typeof handleSessionUpdated>[1]);
        return;
      }

      if (eventType === "session.deleted") {
        return;
      }
    },

    "chat.message": async ({ prompt, sessionID }) => {
      if (!sessionID) return prompt;
      return injectMemories(db, prompt, sessionID, 5);
    },

    "tool.execute.after": async ({ result, sessionID }) => {
      if (!sessionID) return;
      const text = typeof result === "string" ? result : JSON.stringify(result);
      if (!isOutcomeSignal(text)) return;

      const outcome = classifyOutcome(text) === "success";
      const params = await getTuningParams(db);
      const taskTypeResult = await db.execute({
        sql: `SELECT id FROM task_type WHERE name = ?`,
        args: [params.active_partition],
      });
      const taskTypeId = taskTypeResult.rows.length > 0 ? (taskTypeResult.rows[0] as { id: number }).id : 1;

      const retrievedResult = await db.execute({
        sql: `SELECT memory_id FROM session_memory WHERE session_id = ? ORDER BY retrieved_at DESC`,
        args: [sessionID],
      });

      for (const row of retrievedResult.rows) {
        const r = row as unknown as { memory_id: number };
        await recordOutcome(db, sessionID, r.memory_id, outcome, taskTypeId);
      }

      await db.execute({
        sql: `DELETE FROM session_memory WHERE session_id = ?`,
        args: [sessionID],
      });
    },

    "experimental.session.compacting": async (event) => {
      await handleCompacting(db, event as Parameters<typeof handleCompacting>[0]);
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
