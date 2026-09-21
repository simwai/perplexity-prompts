import type { ToolDefinition } from "@opencode-ai/plugin";

export const memorySynthesizeTool: ToolDefinition = {
  name: "memory_synthesize",
  description: "Combine multiple memories into a synthesized insight. Returns a new memory draft without writing.",
  parameters: {
    type: "object",
    properties: {
      memory_ids: { type: "array", items: { type: "number" }, description: "IDs of memories to synthesize" },
    },
    required: ["memory_ids"],
  },
  async execute(args) {
    const ids = Array.isArray(args.memory_ids) ? args.memory_ids.map(Number) : [];
    if (ids.length < 2) return { output: "Error: at least 2 memory IDs required for synthesis" };

    return {
      output: JSON.stringify({
        synthesized: false,
        reason: "synthesis requires tool.execute.after hook with outcome detection",
        input_ids: ids,
      }),
    };
  },
};
