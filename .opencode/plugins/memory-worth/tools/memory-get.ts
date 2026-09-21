import type { ToolDefinition } from "@opencode-ai/plugin";
import { getMemory } from "../db/queries.js";

export const memoryGetTool: ToolDefinition = {
  name: "memory_get",
  description: "Retrieve a single memory by ID with full trust metadata.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "number", description: "Memory ID to retrieve" },
    },
    required: ["id"],
  },
  async execute(args, context) {
    const id = Number(args.id);
    const client = (context as { $: LibSQLClient }).$;
    const memory = await getMemory(client, id);

    if (!memory) return { output: `Error: Memory ${id} not found` };
    return { output: JSON.stringify(memory) };
  },
};
