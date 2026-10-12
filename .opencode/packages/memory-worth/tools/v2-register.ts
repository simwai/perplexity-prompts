/**
 * V2 registration adapter for the memory-worth tools.
 *
 * The 12 tool files are written against the V1 `tool()` helper: they declare
 * Zod `args` and return `{ output }`. V2 wants JSON Schema and a flat tool
 * definition. Rather than rewrite every tool file, this adapter converts at
 * registration time using Zod's own `z.toJSONSchema`, so the business logic in
 * db/ and core/ is untouched.
 *
 * Args are re-validated through the same Zod object on the way in, so a
 * malformed model call is reported as a tool error instead of crashing inside
 * the tool body.
 */

import { z } from "zod";

/** Shape the V1 `tool()` helper produces. */
export interface LegacyToolDefinition {
  description: string;
  args: Record<string, z.ZodType>;
  execute: (
    args: Record<string, unknown>,
    context: Record<string, unknown>,
  ) => Promise<{ output: string } | string>;
}

/** Shape V2's `editor.add()` expects. */
export interface V2ToolDefinition {
  name: string;
  description: string;
  input: unknown;
  execute: (
    input: unknown,
    context: Record<string, unknown>,
  ) => Promise<{ output: string } | string>;
}

/** Minimal structural view of the V2 tool editor. */
export interface ToolAdder {
  add(tool: V2ToolDefinition): void;
}

/**
 * Context the V1 tools expect beyond what V2 supplies on its ToolContext.
 *
 * V2 has no `directory` / `worktree` on the tool context, but the tools resolve
 * their database from `context.directory`. The caller injects them here so the
 * tool bodies keep working unchanged.
 */
export interface LegacyToolContext {
  directory: string;
  worktree?: string;
}

export function toV2Tool(
  name: string,
  legacy: LegacyToolDefinition,
  injected: LegacyToolContext,
): V2ToolDefinition {
  const schema = z.object(legacy.args as z.ZodRawShape);

  return {
    name,
    description: legacy.description,
    input: z.toJSONSchema(schema, { unrepresentable: "any" }),
    async execute(input: unknown, context: Record<string, unknown>) {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ");
        return { output: `Invalid arguments: ${detail}` };
      }
      const result = await legacy.execute(parsed.data as Record<string, unknown>, {
        ...injected,
        ...context,
      });
      return typeof result === "string" ? { output: result } : result;
    },
  };
}