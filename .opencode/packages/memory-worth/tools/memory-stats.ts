import { tool } from "@opencode-ai/plugin";
import { asNumber, asText } from "../db/decode.js";
import { getParameter, getStatsFull } from "../db/queries.js";
import { quantileLabel } from "../core/trust.js";
import { resolveProjectId } from "../db/identity.js";
import { getToolDb } from "./get-db.js";

export const memoryStatsTool = tool({
  description: "Health dashboard: status counts, trust-label distribution, episode outcomes. scope: auto (default) shows current project + global; project shows only the current repo; global shows only shared memories; all shows everything.",
  args: {
    window: tool.schema.number().optional().describe("Recent resolved episodes to score (default 50)"),
    partition: tool.schema.string().optional().describe("Task-type partition to scope memory counts"),
    scope: tool.schema.enum(["auto", "project", "global", "all"]).optional().describe("Stats scope: auto (default), project, global, or all"),
  },
  async execute(args, context) {
    const db = await getToolDb(context.directory);
    const projectId = await resolveProjectId(context.directory);
    const stats = await getStatsFull(db);
    const windowSize = args.window === undefined ? 50 : Math.max(1, Math.floor(args.window));

    let memories = 0;
    let distribution: Record<string, number> = {};
    let projects: string[] | undefined;

    if (args.scope === "all") {
      // no project filter
    } else if (args.scope === "global") {
      projects = ["global"];
    } else if (args.scope === "project") {
      projects = [projectId];
    } else {
      // auto: current project + global
      projects = [projectId, "global"];
    }

    if (args.partition !== undefined) {
      const taskTypeId = await db.execute({
        sql: `SELECT id FROM task_type WHERE name = ?`,
        args: [args.partition],
      });
      if (taskTypeId.rows.length === 0) {
        return { output: JSON.stringify({ error: `unknown partition "${args.partition}"` }) };
      }
      const id = asNumber(taskTypeId.rows[0]?.["id"]);
      const conditions = projects ? `m.task_type_id = ? AND m.project IN (${projects.map(() => "?").join(", ")})` : `m.task_type_id = ?`;
      const queryArgs = projects ? [id, ...projects] : [id];
      const scoped = await db.execute({
        sql: `SELECT ms.name AS status, COUNT(*) AS cnt FROM memory m JOIN memory_status ms ON m.status_id = ms.id WHERE ${conditions} GROUP BY ms.name`,
        args: queryArgs,
      });
      memories = 0;
      distribution = {};
      for (const row of scoped.rows) {
        const cnt = asNumber(row["cnt"]);
        distribution[asText(row["status"])] = cnt;
        memories += cnt;
      }
    } else {
      const projectCondition = projects ? `m.project IN (${projects.map(() => "?").join(", ")})` : "1=1";
      const queryArgs = projects ? [...projects] : [];
      const rows = await db.execute({
        sql: `SELECT m.mw AS mw, m.s_plus AS s_plus, m.s_minus AS s_minus FROM memory m JOIN memory_status ms ON m.status_id = ms.id WHERE ms.name = 'active' AND ${projectCondition}`,
        args: queryArgs,
      });
      const minEv = Number(await getParameter(db, "min_evidence", "3"));
      const trustQ = Number(await getParameter(db, "trust_q", "0.70"));
      const doubtQ = Number(await getParameter(db, "doubt_q", "0.30"));
      const population: number[] = [];
      for (const row of rows.rows) {
        population.push(asNumber(row["mw"]));
      }
      for (const row of rows.rows) {
        const evidence = asNumber(row["s_plus"]) + asNumber(row["s_minus"]);
        const label = evidence < minEv ? "unproven" : quantileLabel(asNumber(row["mw"]), population, trustQ, doubtQ);
        distribution[label] = (distribution[label] ?? 0) + 1;
        memories += 1;
      }
    }

    const recent = await db.execute({
      sql: `SELECT outcome FROM episode WHERE resolved_at IS NOT NULL ORDER BY resolved_at DESC LIMIT ?`,
      args: [windowSize],
    });
    let successes = 0;
    for (const row of recent.rows) {
      successes += asNumber(row["outcome"]);
    }
    return {
      output: JSON.stringify({
        memories,
        by_status: stats.by_status,
        trust_distribution: distribution,
        episodes: stats.episodes,
        unresolved_episodes: stats.unresolved_episodes,
        recent_success_rate: recent.rows.length > 0 ? Math.round((successes / recent.rows.length) * 1000) / 1000 : null,
      }),
    };
  },
});
