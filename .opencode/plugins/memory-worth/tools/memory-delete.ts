import type { ToolDefinition } from "@opencode-ai/plugin";

export const memoryDeleteTool: ToolDefinition = {
  name: "memory_delete",
  description: "Permanently delete a memory.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "number", description: "Memory ID to delete" },
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
      sql: `UPDATE memory SET deleted_at = datetime('now') WHERE id = ?`,
      args: [id],
    });

    return { output: JSON.stringify({ deleted: true, id }) };
  },
};
