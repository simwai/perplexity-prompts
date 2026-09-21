import type { ToolDefinition } from "@opencode-ai/plugin";

export const memoryUpdateTool: ToolDefinition = {
  name: "memory_update",
  description: "Update a memory's content. Preserves accumulated trust scores.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "number", description: "Memory ID to update" },
      content: { type: "string", description: "New content" },
      tags: { type: "string", description: "Updated tags (comma-separated, optional)" },
    },
    required: ["id", "content"],
  },
  async execute(args, context) {
    const id = Number(args.id);
    const content = String(args.content ?? "").trim();
    const client = (context as { $: LibSQLClient }).$;

    const existing = await client.execute({
      sql: `SELECT id FROM memory WHERE id = ? AND deleted_at IS NULL`,
      args: [id],
    });

    if (existing.rows.length === 0) return { output: `Error: Memory ${id} not found` };

    await client.execute({
      sql: `UPDATE memory SET content = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [content, id],
    });

    return { output: JSON.stringify({ updated: true, id }) };
  },
};
