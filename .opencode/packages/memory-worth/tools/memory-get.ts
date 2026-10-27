import { tool } from "@opencode-ai/plugin";
import { asNumber, asText } from "../db/decode.js";
import { getMemoryFull, labelMemory, searchMemoriesFull } from "../db/queries.js";
import { resolveProjectId } from "../db/identity.js";
import { getToolDb } from "./get-db.js";

export const memoryGetTool = tool({
  description: "Retrieve a single memory by ID with full trust metadata. scope: auto (default) allows reading any memory in the current project or global scope; project/global restrict to that scope.",
  args: {
    id: tool.schema.number().describe("Memory ID to retrieve"),
    scope: tool.schema.enum(["auto", "project", "global"]).optional().describe("Read scope: auto (default), project, or global"),
  },
  async execute(args, context) {
    const db = await getToolDb(context.directory);
    const projectId = await resolveProjectId(context.directory);
    const memory = await getMemoryFull(db, args.id);
    if (!memory) return { output: JSON.stringify({ error: `memory ${args.id} not found` }) };

    // Scope enforcement: auto/project/global
    if (args.scope === "project" && memory.project !== projectId) {
      return { output: JSON.stringify({ error: `memory ${args.id} is not in the current project scope` }) };
    }
    if (args.scope === "global" && memory.project !== "global") {
      return { output: JSON.stringify({ error: `memory ${args.id} is not a global memory` }) };
    }

    const trust_label = await labelMemory(db, memory.mw, memory.s_plus, memory.s_minus);
    return { output: JSON.stringify({ ...memory, trust_label }) };
  },
});
