/**
 * MCP tool adapter for memory-worth.
 *
 * Converts the 12 legacy opencode tool definitions (Zod args, `{ output }`
 * return shape) into MCP tool definitions. Reuses the same Zod shape that
 * tools/v2-register.ts uses for the opencode V2 editor, so the business logic
 * in db/ and core/ is untouched.
 *
 * The MCP SDK's `McpServer.registerTool` accepts a Zod raw shape for
 * `inputSchema` and converts it to JSON Schema internally, so we hand it the
 * raw Zod object rather than pre-converting with z.toJSONSchema.
 */

import { z } from "zod";
import {
  memoryDeleteTool,
  memoryGetTool,
  memoryInvalidateTool,
  memoryMergeTool,
  memorySearchTool,
  memorySetStatusTool,
  memoryStatsTool,
  memorySynthesizeTool,
  memoryTuneTool,
  memoryUpdateTool,
  memoryWakeupTool,
  memoryWriteTool,
} from "./tools/index.js";
import type { LegacyToolDefinition } from "./tools/types.js";

export interface McpTool {
  name: string;
  description: string;
  /** Zod raw shape -- the MCP SDK converts this to JSON Schema internally. */
  inputSchema: z.ZodRawShape;
  /** Pre-converted JSON Schema, for clients that want it directly. */
  inputJsonSchema: unknown;
  execute(input: Record<string, unknown>): Promise<{ content: Array<{ type: "text"; text: string }> }>;
}

function toMcpTool(name: string, legacy: LegacyToolDefinition): McpTool {
  const schema = z.object(legacy.args as z.ZodRawShape);

  return {
    name,
    description: legacy.description,
    inputSchema: legacy.args as z.ZodRawShape,
    inputJsonSchema: z.toJSONSchema(schema, { unrepresentable: "any" }),
    async execute(input) {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ");
        throw new Error(`Invalid arguments: ${detail}`);
      }

      const context = {
        directory: "", // not used for DB path; connection is machine-level
        sessionID: process.env.MEMORY_WORTH_SESSION || undefined,
      };

      const result = await legacy.execute(parsed.data as Record<string, unknown>, context);
      const text = typeof result === "string" ? result : result.output;
      return { content: [{ type: "text", text }] };
    },
  };
}

const LEGACY_TOOLS: Record<string, LegacyToolDefinition> = {
  memory_search: memorySearchTool,
  memory_get: memoryGetTool,
  memory_synthesize: memorySynthesizeTool,
  memory_wakeup: memoryWakeupTool,
  memory_write: memoryWriteTool,
  memory_update: memoryUpdateTool,
  memory_invalidate: memoryInvalidateTool,
  memory_merge: memoryMergeTool,
  memory_delete: memoryDeleteTool,
  memory_set_status: memorySetStatusTool,
  memory_stats: memoryStatsTool,
  memory_tune: memoryTuneTool,
};

export const MCP_TOOLS: McpTool[] = Object.entries(LEGACY_TOOLS).map(([name, legacy]) =>
  toMcpTool(name, legacy)
);

export function getMcpTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((t) => t.name === name);
}