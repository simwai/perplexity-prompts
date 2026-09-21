import type { ToolDefinition } from "@opencode-ai/plugin";
import { writeMemory } from "../db/queries.js";
import type { MemoryInput } from "../core/types.js";

export const memoryWriteTool: ToolDefinition = {
  name: "memory_write",
  description: "Store a piece of knowledge in persistent memory. Searches for near-duplicates before writing.",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "The knowledge to store" },
      tags: { type: "string", description: "Comma-separated tags (optional)" },
      task_type: { type: "string", description: "Task type bucket (optional, default: general)" },
    },
    required: ["content"],
  },
  async execute(args, context) {
    const content = String(args.content ?? "").trim();
    if (!content) return { output: "Error: content is required" };

    const client = (context as { $: LibSQLClient }).$;
    const input: MemoryInput = {
      content,
      tags: args.tags,
      task_type: args.task_type,
    };

    const result = await writeMemory(client, input, 1, 1);
    return { output: JSON.stringify({ stored: true, ...result }) };
  },
};
