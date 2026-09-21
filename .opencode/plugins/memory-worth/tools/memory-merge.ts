import type { ToolDefinition } from "@opencode-ai/plugin";

export const memoryMergeTool: ToolDefinition = {
  name: "memory_merge",
  description: "Merge two memories into one. Combines evidence counts and inherits the stronger trust signal.",
  parameters: {
    type: "object",
    properties: {
      source_id: { type: "number", description: "ID of the memory to merge FROM (will be marked merged)" },
      target_id: { type: "number", description: "ID of the memory to merge INTO (will be kept)" },
    },
    required: ["source_id", "target_id"],
  },
  async execute(args, context) {
    const sourceId = Number(args.source_id);
    const targetId = Number(args.target_id);
    const client = (context as { $: LibSQLClient }).$;

    const source = await client.execute({
      sql: `SELECT * FROM memory WHERE id = ? AND deleted_at IS NULL`,
      args: [sourceId],
    });
    const target = await client.execute({
      sql: `SELECT * FROM memory WHERE id = ? AND deleted_at IS NULL`,
      args: [targetId],
    });

    if (source.rows.length === 0) return { output: `Error: Source memory ${sourceId} not found` };
    if (target.rows.length === 0) return { output: `Error: Target memory ${targetId} not found` };

    const s = source.rows[0] as unknown as { content: string; ema_success: number; ema_failure: number; evidence_count: number };
    const t = target.rows[0] as unknown as { content: string; ema_success: number; ema_failure: number; evidence_count: number };

    const sourceWeight = s.evidence_count || 1;
    const targetWeight = t.evidence_count || 1;
    const totalWeight = sourceWeight + targetWeight;

    const mergedEmaSuccess = (s.ema_success * sourceWeight + t.ema_success * targetWeight) / totalWeight;
    const mergedEmaFailure = (s.ema_failure * sourceWeight + t.ema_failure * targetWeight) / totalWeight;

    let mergedContent = t.content;
    if (s.content.length > t.content.length && !t.content.includes(s.content)) {
      mergedContent = `${t.content}\n\n---\n\n${s.content}`;
    }

    await client.execute({
      sql: `UPDATE memory SET content = ?, ema_success = ?, ema_failure = ?, evidence_count = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [mergedContent, mergedEmaSuccess, mergedEmaFailure, t.evidence_count + s.evidence_count, targetId],
    });

    await client.execute({
      sql: `UPDATE memory SET status_id = (SELECT id FROM memory_status WHERE name = 'merged'), deleted_at = datetime('now') WHERE id = ?`,
      args: [sourceId],
    });

    return { output: JSON.stringify({ merged: true, target_id: targetId, source_id: sourceId }) };
  },
};
