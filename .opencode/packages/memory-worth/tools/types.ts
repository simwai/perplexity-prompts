/**
 * Shared type definitions for the memory-worth tool adapter layer.
 *
 * LegacyToolDefinition describes the shape of the V1 `tool()` helper output:
 * Zod args, `{ output }` return shape. V2's MCP registration reuses these
 * definitions without the V1 runtime wrapper.
 */

export interface LegacyToolDefinition {
  description: string;
  args: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    context: Record<string, unknown>,
  ) => Promise<{ output: string } | string>;
}
