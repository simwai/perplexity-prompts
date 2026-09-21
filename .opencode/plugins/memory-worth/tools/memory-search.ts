import type { ToolDefinition } from "@opencode-ai/plugin";
import { searchMemories, getTuningParams } from "../db/queries.js";
import type { SearchResult } from "../core/types.js";

export const memorySearchTool: ToolDefinition = {
  name: "memory_search",
  description: "Search memories by free-text query. Returns ranked results with trust labels (high/neutral/low/unproven).",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      task_type: { type: "string", description: "Filter by task type bucket (optional)" },
      limit: { type: "number", description: "Max results (default 10)" },
    },
    required: ["query"],
  },
  async execute(args, context) {
    const query = String(args.query ?? "").trim();
    if (!query) return { output: "Error: query is required" };

    const limit = Number(args.limit ?? 10);
    const client = (context as { $: LibSQLClient }).$;
    const sessionId = (context as { sessionID?: string }).sessionID;

    const results = await searchMemories(client, query, limit, undefined, sessionId);
    return { output: JSON.stringify(results) };
  },
};
