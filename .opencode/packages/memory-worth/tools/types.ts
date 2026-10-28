/**
 * Shared type definitions for the memory-worth tool adapter layer.
 *
 * LegacyToolDefinition describes the narrow shape the MCP adapter needs from
 * the legacy `tool()` helpers: Zod args, `{ output }` return shape. The
 * execute signature uses method shorthand so the plugin-typed tool objects
 * stay assignable; the Record boundary is closed by schema.safeParse in
 * mcp-tools.ts before any execute call.
 */

export interface LegacyToolDefinition {
  description: string;
  /**
   * Record, not z.ZodRawShape: the tools build these shapes with the zod
   * bundled inside @opencode-ai/plugin, which is a different copy from the
   * package's direct zod dependency, and their class identities do not unify.
   * The consumer casts to z.ZodRawShape once.
   */
  args: Record<string, unknown>;
  execute(args: Record<string, unknown>, context: Record<string, unknown>): Promise<{ output: string } | string>;
}
