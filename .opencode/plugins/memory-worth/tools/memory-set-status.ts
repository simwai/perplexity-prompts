import type { ToolDefinition } from "@opencode-ai/plugin";

export const memorySetStatusTool: ToolDefinition = {
  name: "memory_set_status",
  description: "Set a memory's status: active, archived, invalidated, or merged.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "number", description: "Memory ID" },
      status: { type: "string", description: "Status: active, archived, invalidated, or merged" },
    },
    required: ["id", "status"],
  },
  async execute(args, context) {
    const id = Number(args.id);
    const status = String(args.status ?? "").trim().toLowerCase();
    const client = (context as { $: LibSQLClient }).$;

    const validStatuses = ["active", "archived", "invalidated", "merged"];
    if (!validStatuses.includes(status)) return { output: `Error: invalid status "${status}". Valid: ${validStatuses.join(", ")}` };

    const existing = await client.execute({
      sql: `SELECT id FROM memory WHERE id = ? AND deleted_at IS NULL`,
      args: [id],
    });

    if (existing.rows.length === 0) return { output: `Error: Memory ${id} not found` };

    const statusResult = await client.execute({
      sql: `SELECT id FROM memory_status WHERE name = ?`,
      args: [status],
    });

    if (statusResult.rows.length === 0) return { output: `Error: status "${status}" not found in lookup table` };

    await client.execute({
      sql: `UPDATE memory SET status_id = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [(statusResult.rows[0] as { id: number }).id, id],
    });

    return { output: JSON.stringify({ set_status: true, id, status }) };
  },
};
