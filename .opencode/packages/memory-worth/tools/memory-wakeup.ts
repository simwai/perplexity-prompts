import { tool } from "@opencode-ai/plugin";
import { asNumber, asText } from "../db/decode.js";
import { daysAgo, epochInt } from "../db/epoch.js";
import { getStatsFull } from "../db/queries.js";
import { resolveProjectId } from "../db/identity.js";
import { getToolDb } from "./get-db.js";

const POLICY = "Search memory before answering when prior context could help. Store durable insights with memory_write (applies_when is required). Prefer updating over duplicating. scope: auto routes project-local writes to the current repo; ungrounded convention/reference memories go to global.";

export const memoryWakeupTool = tool({
  description: "Session-start digest: health counts, unresolved episodes, stale and unproven memories. Returns the resolved session id and the memory protocol reminder.",
  args: {
    session: tool.schema.string().optional().describe("Session id to resume; if omitted, an open episode within 60 min is reused or a new one is minted"),
  },
  async execute(args, context) {
    const db = await getToolDb(context.directory);
    const projectId = await resolveProjectId(context.directory);

    // Resolve session identity: env > arg > open episode < 60 min > minted id
    let sessionId = process.env.MEMORY_WORTH_SESSION || args.session;
    if (!sessionId) {
      const open = await db.execute({
        sql: `SELECT id, session_id FROM episode WHERE resolved_at IS NULL AND last_activity_at > ? ORDER BY last_activity_at DESC LIMIT 1`,
        args: [daysAgo(1 / 24)], // 60 minutes in days (1/24)
      });
      if (open.rows.length > 0) {
        sessionId = asText(open.rows[0]?.["session_id"]);
      }
    }
    if (!sessionId) {
      const now = new Date();
      const rand = Math.floor(Math.random() * 1000000).toString(16).padStart(6, "0");
      sessionId = `auto-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}-${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}-${rand}`;
    }

    // Touch last_activity_at on the episode (UPDATE then INSERT if absent)
    const taskTypeId = await db.execute({
      sql: `SELECT id FROM task_type WHERE name = 'general'`,
      args: [],
    });
    const ttId = asNumber(taskTypeId.rows[0]?.["id"]) ?? 1;
    const updated = await db.execute({
      sql: `UPDATE episode SET last_activity_at = ? WHERE session_id = ? AND resolved_at IS NULL`,
      args: [epochInt(), sessionId],
    });
    if (updated.rowsAffected === 0) {
      await db.execute({
        sql: `INSERT INTO episode (session_id, task_type_id, started_at, last_activity_at) VALUES (?, ?, ?, ?)`,
        args: [sessionId, ttId, epochInt(), epochInt()],
      });
    }

    const stats = await getStatsFull(db);
    const staleRows = await db.execute({
      sql: `SELECT m.id AS id, m.content AS content, m.updated_at AS updated_at FROM memory m JOIN memory_status ms ON m.status_id = ms.id WHERE ms.name = 'active' AND m.updated_at < ? ORDER BY m.updated_at ASC LIMIT 5`,
      args: [Number(daysAgo(7))],
    });
    const stale: Array<{ id: number; snippet: string; updated_at: number }> = [];
    for (const row of staleRows.rows) {
      stale.push({
        id: asNumber(row["id"]),
        snippet: asText(row["content"]).slice(0, 160),
        updated_at: asNumber(row["updated_at"]),
      });
    }
    const unproven = await db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM memory m JOIN memory_status ms ON m.status_id = ms.id WHERE ms.name = 'active' AND (m.s_plus + m.s_minus) < CAST((SELECT value FROM parameter WHERE key = 'min_evidence') AS REAL)`,
      args: [],
    });

    return {
      output: JSON.stringify({
        session: sessionId,
        project: projectId,
        policy: POLICY,
        total: stats.total,
        by_status: stats.by_status,
        avg_mw: Math.round(stats.avg_mw * 1000) / 1000,
        unresolved_episodes: stats.unresolved_episodes,
        stale,
        unproven: asNumber(unproven.rows[0]?.["cnt"]),
      }),
    };
  },
});
