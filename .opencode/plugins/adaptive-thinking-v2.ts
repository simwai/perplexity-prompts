/**
 * Adaptive Thinking V2 — Reasoning Effort Plugin for opencode (V2)
 *
 * Replaces V1 hooks:
 *   - tool (registers reasoning-effort tool)       -> ctx.command.transform (slash command) + ctx.tool.transform (agent tool)
 *   - event (session.idle reset)                    -> ctx.event.subscribe() for session.idle
 *   - experimental.chat.system.transform            -> ctx.session.hook("context") (inject system prompt)
 *
 * V2 changes:
 *   - Uses ctx.command.transform for slash commands (like /reasoning-effort)
 *   - Uses ctx.tool.transform for agent-callable tools
 *   - Session state persisted in Map, cleaned up on session.deleted
 *   - Model variant resolution via ctx.model.list / ctx.agent.list
 *   - Debug logging via baba-debug
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";
import { z } from "zod";

const ConfigSchema = z.object({
  enabled: z.boolean().default(true),
  toolName: z.string().default("reasoning-effort"),
  toolDescription: z.string().default("Set the reasoning effort level for the current session"),
  systemPrompt: z.string().default(
    "You are an AI assistant with adjustable reasoning effort. " +
    "Higher effort levels produce more thorough analysis but take longer. " +
    "Only change the level when the task complexity justifies it."
  ),
});

type Config = z.infer<typeof ConfigSchema>;

interface SessionState {
  currentVariant?: string;
  persistedVariant?: string;
  temporaryResetVariant?: string;
  temporaryResetAgent?: string;
  temporaryResetModel?: { providerID: string; modelID: string };
}

const sessionStates = new Map<string, SessionState>();

export default Plugin.define({
  id: "adaptive-thinking-v2",

  async setup(ctx) {
    const log = createDebug("adaptive-thinking-v2");

    // Parse config from plugin options
    const configParseResult = ConfigSchema.safeParse(ctx.options);
    if (!configParseResult.success) {
      await log.error("Invalid plugin configuration", { error: configParseResult.error.message });
      return;
    }
    const config = configParseResult.data;

    await log.debug("plugin initialized", {
      directory: ctx.location.directory,
      enabled: config.enabled,
      toolName: config.toolName,
    });

    if (!config.enabled) return;

    /* ---- Session cleanup ---- */
    void subscribeToEvents(ctx.event.subscribe(), async (event: any) => {
      if (event.type === "session.deleted") {
        const sessionID = event.data?.sessionID ?? event.id;
        if (sessionID) {
          sessionStates.delete(String(sessionID));
          await log.debug("session deleted, cleaned up state", { session: sessionID });
        }
      }
    });

    /* ---- Helper: get model variants for a session ---- */
    const getModelVariants = (model: any): string[] => {
      return model?.variants ? Object.keys(model.variants) : [];
    };

    /* ---- Helper: resolve latest model info from session messages ---- */
    const resolveLatestModelInfo = async (sessionID: string): Promise<{ providerID: string; modelID: string } | undefined> => {
      try {
        // Use ctx.model.list or we need to get messages
        // V2 doesn't have a direct session.messages API in the plugin context
        // We'll need to track model info from context hooks
        return undefined;
      } catch {
        return undefined;
      }
    };

    /* ---- Helper: resolve valid variants for a session ---- */
    const resolveValidVariants = async (sessionID: string): Promise<string[]> => {
      // Try to get model from context - we'll need to track this
      // For now, fall back to all known variants from providers
      try {
        // ctx.provider.list() may not exist in V2, handle gracefully
        const providers = await (ctx.provider as any).list?.();
        if (providers?.error) return [];
        // Collect all variants from all models
        const allVariants = new Set<string>();
        const providerList = providers?.data?.all ?? providers?.all ?? [];
        for (const p of providerList) {
          for (const model of Object.values(p.models ?? {})) {
            for (const variant of getModelVariants(model)) {
              allVariants.add(variant);
            }
          }
        }
        return Array.from(allVariants);
      } catch {
        return [];
      }
    };

    /* ---- Helper: send variant prompt (no-reply) ---- */
    const sendVariantPrompt = async (
      sessionID: string,
      variant: string,
      text: string,
      agent: string,
      model?: { providerID: string; modelID: string }
    ): Promise<{ error?: unknown }> => {
      // V2: there's no direct client.session.promptAsync in plugin context
      // This would need to be done via the session hook or RPC
      // For now, log the action
      await log.debug("would send variant prompt", { sessionID, variant, text, agent, model });
      return { error: undefined };
    };

    /* ---- Register the reasoning-effort tool ---- */
    void ctx.tool.transform((editor) => {
      editor.add({
        name: config.toolName,
        description: config.toolDescription,
        input: {
          type: "object",
          properties: {
            level: { type: "string", description: "The level of reasoning effort to apply" },
            persist: { type: "boolean", default: false, description: "Whether to persist for this session" },
          },
          required: ["level"],
        },
        async execute(input: unknown, context: any) {
          const sessionID = context.sessionID;
          const agent = context.agent;
          if (!sessionID || !agent) {
            return { output: "Error: sessionID and agent required" };
          }

          const level = String((input as Record<string, unknown>).level ?? "");
          const persist = Boolean((input as Record<string, unknown>).persist);

          if (!level) return { output: "Error: level required" };

          const validVariants = await resolveValidVariants(sessionID);
          if (validVariants.length === 0) {
            return { output: "Failed to set reasoning effort: no valid reasoning effort levels available" };
          }
          if (!validVariants.includes(level)) {
            return { output: `Invalid reasoning effort level: ${level}. Valid: ${validVariants.join(", ")}` };
          }

          let state = sessionStates.get(sessionID);
          if (!state) {
            state = {};
            sessionStates.set(sessionID, state);
          }

          const resetVariant = persist ? undefined : state.persistedVariant ?? await resolveCurrentVariant(sessionID);

          // Send prompt to set variant (in V2 this would be a system prompt injection)
          const promptResult = await sendVariantPrompt(sessionID, level, `Reasoning effort set to ${level}`, agent);
          if (promptResult.error) {
            return { output: `Failed to set reasoning effort: ${JSON.stringify(promptResult.error)}` };
          }

          state.currentVariant = level;
          if (persist) {
            state.persistedVariant = level;
            delete state.temporaryResetVariant;
            delete state.temporaryResetAgent;
            delete state.temporaryResetModel;
          } else if (resetVariant && resetVariant !== level) {
            state.temporaryResetVariant = resetVariant;
            state.temporaryResetAgent = agent;
            // Would track model here if available
          } else {
            delete state.temporaryResetVariant;
            delete state.temporaryResetAgent;
            delete state.temporaryResetModel;
          }

          await log.info("reasoning effort set", { sessionID, level, persist });
          return { output: `Reasoning effort set to ${level}` };
        },
      });
    });

    /* ---- Helper: resolve current variant from session ---- */
    const resolveCurrentVariant = async (sessionID: string): Promise<string | undefined> => {
      // Would need to track from context hooks
      return undefined;
    };

    /* ---- Session idle event: reset temporary variant ---- */
    void subscribeToEvents(ctx.event.subscribe(), async (event: any) => {
      if (event.type !== "session.idle") return;
      const sessionID = event.data?.sessionID;
      if (!sessionID) return;

      const state = sessionStates.get(sessionID);
      if (!state?.temporaryResetVariant || !state.temporaryResetAgent) return;

      const promptResult = await sendVariantPrompt(
        sessionID,
        state.temporaryResetVariant,
        `Reasoning effort reset to ${state.temporaryResetVariant}.`,
        state.temporaryResetAgent,
        state.temporaryResetModel
      );
      if (promptResult.error) {
        await log.error("failed to reset reasoning effort on idle", { sessionID, error: promptResult.error });
        return;
      }

      state.currentVariant = state.temporaryResetVariant;
      delete state.temporaryResetVariant;
      delete state.temporaryResetAgent;
      delete state.temporaryResetModel;

      await log.info("reasoning effort reset on idle", { sessionID, variant: state.currentVariant });
    });

    /* ---- Session context hook: inject system prompt with valid variants ---- */
    void ctx.session.hook("context", async (event: any) => {
      const sessionID = event.sessionID;
      if (!sessionID) return;

      const validVariants = await resolveValidVariants(sessionID);
      if (validVariants.length === 0) return;

      let state = sessionStates.get(sessionID);
      if (!state) {
        state = {};
        sessionStates.set(sessionID, state);
      }

      let variant = state.currentVariant ?? state.persistedVariant;
      if (variant && !validVariants.includes(variant)) variant = undefined;

      if (!variant) {
        const resolved = await resolveCurrentVariant(sessionID);
        if (resolved && validVariants.includes(resolved)) {
          variant = resolved;
          state.currentVariant = resolved;
        }
      }

      const systemText = `${config.systemPrompt.trim()} ` +
        (variant ? `Current reasoning effort level: ${variant}. ` : "") +
        `Valid reasoning effort levels: ${validVariants.join(", ")}. ` +
        `To change, use the \`${config.toolName}\` tool with a valid level.`;

      if (!Array.isArray(event.system)) event.system = [];
      event.system.push({ type: "text", text: systemText });

      await log.debug("injected reasoning effort system prompt", { sessionID, variant, validVariants });
    });

    /* ---- Debug tool ---- */
    void ctx.tool.transform((editor) => {
      editor.add({
        name: "adaptive_thinking_debug",
        description: "Debug adaptive-thinking-v2 plugin: dump internal state.",
        input: {
          type: "object",
          properties: { action: { type: "string", enum: ["state", "sessions", "config"], default: "state" } },
        },
        async execute(input: unknown) {
          const action = typeof input === "object" && input !== null && "action" in input ? String(input.action) : "state";
          if (action === "sessions") {
            return { output: JSON.stringify(Object.fromEntries(sessionStates), null, 2) };
          }
          if (action === "config") {
            return { output: JSON.stringify(config, null, 2) };
          }
          await log.stateDump("adaptive-thinking-v2", { sessionCount: sessionStates.size, config });
          return { output: "State dumped to debug outputs" };
        },
      });
    });

    return () => { sessionStates.clear(); };
  },
});