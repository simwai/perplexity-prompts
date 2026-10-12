/**
 * Adaptive Temperature plugin for opencode (V2)
 *
 * Lets the model tune generation parameters from user feedback instead of the
 * user editing config. The model reports a delta; the plugin clamps it into
 * range, remembers it per session, and applies it to the next model call.
 *
 * V2 changes:
 *   - `chat.params` became `ctx.session.hook("context")` with the values now
 *     written to `event.options.temperature` / `event.options.topP` (semantic
 *     generation options) rather than to a bespoke output object.
 *   - `command.execute.before` has no V2 global hook. The plugin owns the
 *     `feedback` command, so it is registered through `ctx.command.transform`.
 *   - The guidance prompt that used to go out as `client.session.prompt({noReply})`
 *     is now prepended to `event.system` on the following model request, which
 *     is the V2-native way to speak to the model without spending a turn.
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

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

const sessionStates = new Map<string, SessionState>();

/** Feedback text awaiting the guidance pass on the next model request. */
const pendingFeedback = new Map<string, string>();

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

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** Extracts the user's argument text from a slash-command invocation. */
function readPromptText(prompt: unknown): string {
  if (typeof prompt !== "object" || prompt === null) return "";
  const direct = readStringField(prompt, "text");
  if (direct) return direct;
  const parts = (prompt as { parts?: unknown }).parts;
  if (Array.isArray(parts)) {
    const chunks = parts
      .map((part) => readStringField(part, "text"))
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    if (chunks.length > 0) return chunks.join("\n");
  }
  return "";
}

export default Plugin.define({
  id: "adaptive-temperature",

  setup(ctx) {
    const config = resolveConfig(ctx.options);
    const log = createDebug("adaptive-temperature");

    void log.debug("plugin initialized", {
      config: { min: config.min, max: config.max, default: config.default },
    });

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      if (event.type !== "session.deleted") return;
      const sessionID = readDataString(event, "sessionID");
      if (!sessionID) return;
      void log.debug("session deleted, cleaning up state", { session: sessionID });
      sessionStates.delete(sessionID);
      pendingFeedback.delete(sessionID);
    });

    void ctx.command.transform((editor) => {
      editor.add({
        name: "feedback",
        description: "Adjust generation parameters from feedback about output quality or style.",
        async execute(input: { sessionID: string; prompt: unknown }) {
          const sessionID = readStringField(input, "sessionID");
          if (!sessionID) return;
          const feedbackText = readPromptText(input.prompt).trim();
          if (!feedbackText) return;

          await log.debug("feedback command received", { session: sessionID, feedback: feedbackText });
          const state = getSessionState(sessionID, config);

          // Guidance is delivered on the next model request rather than via a
          // synthetic prompt, which is what produced FOREIGN KEY errors under V1.
          pendingFeedback.set(sessionID, feedbackText);
          void log.debug("feedback queued for next model request", {
            session: sessionID,
            currentSettings: {
              temperature: state.temperature,
              topP: state.topP,
            },
          });
        },
      });
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "apply_feedback",
        description:
          "Apply generation parameter adjustments based on user feedback. Call this when the user gives feedback about output quality, style, or behavior.",
        input: {
          type: "object",
          properties: {
            temperatureDelta: {
              type: "number",
              description:
                "Delta to apply to temperature (-1.0 to 1.0). Positive increases randomness, negative decreases it.",
            },
            topPDelta: {
              type: "number",
              description:
                "Delta to apply to topP (-1.0 to 1.0). Positive increases token diversity, negative narrows focus.",
            },
            reasoning: {
              type: "string",
              description: "Brief explanation of why these adjustments address the feedback.",
            },
          },
          required: ["temperatureDelta", "topPDelta", "reasoning"],
        },
        async execute(input: unknown, context) {
          const sessionID = readStringField(context, "sessionID");
          if (!sessionID) return { output: "Error: session ID required" };

          const temperatureDelta = readNumber(readField(input, "temperatureDelta"));
          const topPDelta = readNumber(readField(input, "topPDelta"));
          const reasoning = readStringField(input, "reasoning") ?? "";

          if (temperatureDelta === undefined || topPDelta === undefined) {
            return { output: "Error: temperatureDelta and topPDelta must be numbers" };
          }

          const state = getSessionState(sessionID, config);
          const prevTemperature = state.temperature;
          const prevTopP = state.topP;

          state.temperature = clamp(
            state.temperature + temperatureDelta,
            config.min.temperature,
            config.max.temperature,
          );
          state.topP = clamp(state.topP + topPDelta, config.min.topP, config.max.topP);

          await log.info("feedback applied", {
            session: sessionID,
            reasoning,
            prevTemperature,
            newTemperature: state.temperature,
            prevTopP,
            newTopP: state.topP,
          });

          return {
            output:
              `Applied feedback: temperature ${prevTemperature.toFixed(2)} -> ${state.temperature.toFixed(2)}, ` +
              `topP ${prevTopP.toFixed(2)} -> ${state.topP.toFixed(2)}`,
          };
        },
      });

      editor.add({
        name: "adaptive_temperature_debug",
        description: "Debug adaptive-temperature plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "sessions", "config"],
              default: "state",
              description:
                "What to dump: state (all), sessions (adaptive temperature states per session), config (plugin config)",
            },
          },
        },
        async execute(input: unknown) {
          const action = readStringField(input, "action");
          if (action === "config") {
            return {
              output: JSON.stringify({ min: config.min, max: config.max, default: config.default }, null, 2),
            };
          }
          if (action === "sessions") {
            return { output: JSON.stringify(Object.fromEntries(sessionStates), null, 2) };
          }
          await log.stateDump("adaptive-temperature", {
            config: { min: config.min, max: config.max, default: config.default },
            sessionCount: sessionStates.size,
            sessions: Object.fromEntries(sessionStates),
          });
          return { output: "State dumped to debug outputs (console, file, client.app.log)" };
        },
      });
    });

    void ctx.session.hook("context", async (event) => {
      const sessionID = event.sessionID;
      if (typeof sessionID !== "string" || sessionID.length === 0) return;

      // 1. Apply the tuned values. opencode seeds temperature/topP from this
      //    hook, so without writing them the tool would only mutate state.
      const state = sessionStates.get(sessionID);
      if (state) {
        await log.debug("context injecting values", {
          session: sessionID,
          temperature: state.temperature,
          topP: state.topP,
        });

        // temperature is undefined for models without temperature support, so it
        // is only written when the runtime already provided one.
        if (event.options.temperature !== undefined) {
          event.options.temperature = state.temperature;
        }
        event.options.topP = state.topP;
      }

      if (!Array.isArray(event.system)) return;

      // 2. Consume queued feedback: tell the model to interpret it.
      const feedbackText = pendingFeedback.get(sessionID);
      if (feedbackText !== undefined) {
        pendingFeedback.delete(sessionID);
        const current = state ?? getSessionState(sessionID, config);
        const guidance =
          `[ADAPTIVE FEEDBACK]\nUser feedback: "${feedbackText}"\n` +
          `Current settings: temperature=${current.temperature.toFixed(2)}, topP=${current.topP.toFixed(2)}\n\n` +
          "Interpret this feedback and call `apply_feedback` with appropriate deltas for temperature and topP, plus a brief reasoning. " +
          "Consider how the current settings relate to the feedback when choosing deltas.";
        event.system = [{ type: "text", text: guidance }, ...event.system];
        await log.debug("feedback guidance injected", { session: sessionID });
      }

      // 3. Standing reminder about the feedback loop.
      const currentSettings = state
        ? `temperature=${state.temperature.toFixed(2)}, topP=${state.topP.toFixed(2)}`
        : `temperature=${config.default.temperature.toFixed(2)}, topP=${config.default.topP.toFixed(2)}`;

      await log.debug("context adding adaptive feedback reminder", {
        session: sessionID,
        currentSettings,
      });

      event.system = [
        ...event.system,
        {
          type: "text",
          text:
            "ADAPTIVE FEEDBACK: When the user gives feedback about output quality, style, or behavior, call the `apply_feedback` tool with temperatureDelta, topPDelta, and reasoning. " +
            `Current settings: ${currentSettings}. ` +
            "Interpret the feedback relative to current settings and return small, bounded deltas. " +
            "Example feedback -> adjustment: 'too random' -> temperatureDelta=-0.1, topPDelta=-0.05; 'too boring' -> temperatureDelta=0.1, topPDelta=0.05; 'too narrow' -> temperatureDelta=0.0, topPDelta=0.1; 'too verbose' -> temperatureDelta=-0.05, topPDelta=0.0.",
        },
      ];
    });

    return () => {
      sessionStates.clear();
      pendingFeedback.clear();
    };
  },
});

function readDataString(event: unknown, key: string): string | undefined {
  if (typeof event !== "object" || event === null) return undefined;
  const data = (event as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readField(input: unknown, key: string): unknown {
  if (typeof input !== "object" || input === null) return undefined;
  return (input as Record<string, unknown>)[key];
}