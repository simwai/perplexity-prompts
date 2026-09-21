import type { ToolDefinition } from "@opencode-ai/plugin";

export const memoryInvalidateTool: ToolDefinition = {
  name: "memory_invalidate",
  description: "Mark a memory as invalidated. Invalidated memories are excluded from search results.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "number", description: "Memory ID to invalidate" },
    },
    required: ["id"],
  },
  async execute(args, context) {
    const id = Number(args.id);
    const client = (context as { $: LibSQLClient }).$;

    const existing = await client.execute({
      sql: `SELECT id FROM memory WHERE id = ? AND deleted_at IS NULL`,
      args: [id],
    });

    if (existing.rows.length === 0) return { output: `Error: Memory ${id} not found` };

    await client.execute({
      sql: `UPDATE memory SET status_id = (SELECT id FROM memory_status WHERE name = 'invalidated'), updated_at = datetime('now') WHERE id = ?`,
      args: [id],
    });

    return { output: JSON.stringify({ invalidated: true, id }) };
  },
};
