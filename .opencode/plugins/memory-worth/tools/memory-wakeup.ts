import type { ToolDefinition } from "@opencode-ai/plugin";

export const memoryWakeupTool: ToolDefinition = {
  name: "memory_wakeup",
  description: "Surface stale but potentially relevant memories for re-evaluation.",
  parameters: {
    type: "object",
    properties: {
      min_age_days: { type: "number", description: "Minimum age in days (default 7)" },
      max_results: { type: "number", description: "Max results (default 20)" },
    },
    required: [],
  },
  async execute(args, context) {
    const minAge = Number(args.min_age_days ?? 7);
    const maxResults = Number(args.max_results ?? 20);
    const client = (context as { $: LibSQLClient }).$;

    const result = await client.execute({
      sql: `SELECT m.id, m.content, m.evidence_count, m.ema_success, m.ema_failure, m.updated_at FROM memory m WHERE m.deleted_at IS NULL AND datetime(m.updated_at) < datetime('now', ?) ORDER BY m.updated_at ASC LIMIT ?`,
      args: [`-${minAge} days`, maxResults],
    });

    const memories = result.rows.map((row) => {
      const r = row as unknown as { id: number; content: string; evidence_count: number; ema_success: number; ema_failure: number; updated_at: string };
      const total = r.ema_success + r.ema_failure;
      const score = total === 0 ? 0.5 : r.ema_success / total;
      return {
        id: r.id,
        content: r.content,
        trust_score: Math.round(score * 100) / 100,
        evidence_count: r.evidence_count,
        updated_at: r.updated_at,
      };
    });

    return { output: JSON.stringify({ memories, min_age_days: minAge }) };
  },
};
