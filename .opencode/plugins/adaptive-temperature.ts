import { type Plugin, tool } from "@opencode-ai/plugin";
import { createDebug } from "../lib/baba-debug";

type GenerationConfig = {
  temperature: number;
  topP: number;
};

type FeedbackConfig = {
  min: GenerationConfig;
  max: GenerationConfig;
  default: GenerationConfig;
};

type SessionState = {
  temperature: number;
  topP: number;
};

type ApplyFeedbackArgs = {
  temperatureDelta: number;
  topPDelta: number;
  reasoning: string;
};

const sessionStates = new Map<string, SessionState>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveConfig(options: Record<string, unknown>): FeedbackConfig {
  return {
    min: {
      temperature: typeof options.minTemperature === "number" ? options.minTemperature : 0.0,
      topP: typeof options.minTopP === "number" ? options.minTopP : 0.1,
    },
    max: {
      temperature: typeof options.maxTemperature === "number" ? options.maxTemperature : 1.0,
      topP: typeof options.maxTopP === "number" ? options.maxTopP : 1.0,
    },
    default: {
      temperature: typeof options.defaultTemperature === "number" ? options.defaultTemperature : 0.2,
      topP: typeof options.defaultTopP === "number" ? options.defaultTopP : 0.9,
    },
  };
}

function getSessionState(sessionID: string, config: FeedbackConfig): SessionState {
  const existing = sessionStates.get(sessionID);
  if (existing) return existing;
  const initial: SessionState = {
    temperature: config.default.temperature,
    topP: config.default.topP,
  };
  sessionStates.set(sessionID, initial);
  return initial;
}

export default async (_ctx: any, options?: Record<string, unknown>): Promise<any> => {
  const config = resolveConfig(options ?? {});
  const log = createDebug("adaptive-temperature", _ctx?.client);

  await log.debug("plugin initialized", { config: { min: config.min, max: config.max, default: config.default } });

  return {
    tool: {
      apply_feedback: tool({
        description:
          "Apply generation parameter adjustments based on user feedback. Call this when the user gives feedback about output quality, style, or behavior.",
        args: {
          temperatureDelta: tool.schema
            .number()
            .describe("Delta to apply to temperature (-1.0 to 1.0). Positive increases randomness, negative decreases it."),
          topPDelta: tool.schema
            .number()
            .describe("Delta to apply to topP (-1.0 to 1.0). Positive increases token diversity, negative narrows focus."),
          reasoning: tool.schema
            .string()
            .describe("Brief explanation of why these adjustments address the feedback."),
        },
        async execute(args, context) {
          const { sessionID } = context;
          if (!sessionID) {
            return "Error: session ID required";
          }

          const state = getSessionState(sessionID, config);
          const prevTemperature = state.temperature;
          const prevTopP = state.topP;

          state.temperature = clamp(
            state.temperature + args.temperatureDelta,
            config.min.temperature,
            config.max.temperature,
          );
          state.topP = clamp(state.topP + args.topPDelta, config.min.topP, config.max.topP);

          await log.info("feedback applied", {
            session: sessionID,
            reasoning: args.reasoning,
            prevTemperature,
            newTemperature: state.temperature,
            prevTopP,
            newTopP: state.topP,
          });

          return `Applied feedback: temperature ${prevTemperature.toFixed(2)} -> ${state.temperature.toFixed(2)}, topP ${prevTopP.toFixed(2)} -> ${state.topP.toFixed(2)}`;
        },
      }),

      adaptive_temperature_debug: tool({
        description: "Debug adaptive-temperature plugin: dump internal state.",
        args: {
          action: tool.schema
            .enum(["state", "sessions", "config"])
            .default("state")
            .describe("What to dump: state (all), sessions (adaptive temperature states per session), config (plugin config)"),
        },
        async execute(args) {
          switch (args.action) {
            case "config":
              return JSON.stringify({ min: config.min, max: config.max, default: config.default }, null, 2);
            case "sessions": {
              const sessions: Record<string, SessionState> = {};
              for (const [id, state] of sessionStates.entries()) {
                sessions[id] = state;
              }
              return JSON.stringify(sessions, null, 2);
            }
            case "state":
            default: {
              await log.stateDump("adaptive-temperature", {
                config: { min: config.min, max: config.max, default: config.default },
                sessionCount: sessionStates.size,
                sessions: Object.fromEntries(sessionStates),
              });
              return "State dumped to debug outputs (console, file, client.app.log)";
            }
          }
        },
      }),
    },

    "command.execute.before": async (
      input: { command: string; sessionID?: string; arguments?: string },
      output: { parts: Array<Record<string, unknown>> },
    ) => {
      const { command, sessionID, arguments: args } = input;
      if (!sessionID || command !== "feedback") return;

      const feedbackText = (args ?? "").trim();
      if (!feedbackText) return;

      await log.debug("feedback command received", { session: sessionID, feedback: feedbackText });

      const state = getSessionState(sessionID, config);

      // Guidance for the model to translate the feedback into concrete deltas
      // and call apply_feedback. Using client.session.prompt with noReply to
      // avoid FOREIGN KEY constraint on synthetic message IDs.
      const contextPrompt = `[ADAPTIVE FEEDBACK]\nUser feedback: "${feedbackText}"\nCurrent settings: temperature=${state.temperature.toFixed(2)}, topP=${state.topP.toFixed(2)}\n\nInterpret this feedback and call \`apply_feedback\` with appropriate deltas for temperature and topP, plus a brief reasoning. Consider how the current settings relate to the feedback when choosing deltas.`;
      try {
        await _ctx.client.session.prompt({
          path: { id: sessionID },
          body: { noReply: true, parts: [{ type: "text", text: contextPrompt }] },
        });
        await log.debug("feedback prompt sent to model", { session: sessionID });
      } catch (e) {
        await log.warn("failed to send feedback prompt", { session: sessionID, error: String(e) });
        // If session.prompt fails, the feedback is still recorded in session state
        // and will be applied on next turn via chat.params hook
      }
    },

    // Applies the tuned values to the actual generation parameters. Without
    // this hook the tool only mutates session state and the model's temperature
    // never changes: opencode seeds temperature/topP here, from
    // session/llm/request.ts, and uses whatever this hook returns.
    "chat.params": async (
      input: { sessionID: string },
      output: { temperature: number | undefined; topP: number },
    ) => {
      const state = sessionStates.get(input.sessionID);
      if (!state) return;

      await log.debug("chat.params injecting values", {
        session: input.sessionID,
        temperature: state.temperature,
        topP: state.topP,
      });

      // temperature is undefined for models without temperature support, so it
      // is only written when the runtime provided one.
      if (output.temperature !== undefined) {
        output.temperature = state.temperature;
      }
      output.topP = state.topP;
    },

    "experimental.chat.system.transform": async ({ sessionID, model }: { sessionID?: string; model?: any }, { system }: { system: string[] }) => {
      if (!sessionID) return;

      const state = sessionStates.get(sessionID);
      const currentSettings = state
        ? `temperature=${state.temperature.toFixed(2)}, topP=${state.topP.toFixed(2)}`
        : `temperature=${config.default.temperature.toFixed(2)}, topP=${config.default.topP.toFixed(2)}`;

      await log.debug("system transform adding adaptive feedback reminder", {
        session: sessionID,
        currentSettings,
      });

      system.push(
        "ADAPTIVE FEEDBACK: When the user gives feedback about output quality, style, or behavior, call the `apply_feedback` tool with temperatureDelta, topPDelta, and reasoning. " +
          `Current settings: ${currentSettings}. ` +
          "Interpret the feedback relative to current settings and return small, bounded deltas. " +
          "Example feedback -> adjustment: 'too random' -> temperatureDelta=-0.1, topPDelta=-0.05; 'too boring' -> temperatureDelta=0.1, topPDelta=0.05; 'too narrow' -> temperatureDelta=0.0, topPDelta=0.1; 'too verbose' -> temperatureDelta=-0.05, topPDelta=0.0.",
      );
    },

    event: async ({ event }: { event: any }) => {
      if (event.type === "session.deleted") {
        const sessionID = (event as any).properties?.sessionID;
        if (sessionID) {
          await log.debug("session deleted, cleaning up state", { session: sessionID });
          sessionStates.delete(sessionID);
        }
      }
    },
  };
};
