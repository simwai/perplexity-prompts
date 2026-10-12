/**
 * Multi-Model Consensus plugin for opencode (V2)
 *
 * Runs a text-only draft through two free models for self-critique and merges
 * the results with a judge model. Off by default; `/consensus on` enables it
 * per session. The tool skips any turn where other tools already ran, so a
 * tool-calling turn is never presented as text-only.
 *
 * V2 changes:
 *   - `command.execute.before` has no V2 global hook. The plugin owns the
 *     `consensus` command, so it is registered through `ctx.command.transform`.
 *   - `tool.execute.after` became `ctx.tool.hook("execute.after")`, which reads
 *     `event.tool` and `event.sessionID`.
 *   - `experimental.chat.system.transform` became `ctx.session.hook("context")`
 *     appending to `event.system` (SystemPart objects, not bare strings).
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

const KILO_BASE_URL = "https://api.kilo.ai/api/gateway";
const FLASH_MODEL = "stepfun/step-3.7-flash:free";
const ULTRA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const REQUEST_TIMEOUT_MS = 90000;
const TOOL_SKIP_WINDOW_MS = 60000;

const enabledSessions = new Map<string, boolean>();
const lastToolUse = new Map<string, number>();

type KiloMessage = {
  role: string;
  content: string;
};

type KiloResponse = {
  choices?: { message?: { content?: unknown } }[];
};

async function callKilo(model: string, messages: KiloMessage[]): Promise<string> {
  const res = await fetch(`${KILO_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer anonymous",
    },
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Kilo ${model} HTTP ${res.status}`);
  }
  const data = (await res.json()) as KiloResponse;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error(`Kilo ${model} empty response`);
  }
  return text.trim();
}

function selfCritique(model: string, prompt: string, original: string): Promise<string> {
  return callKilo(model, [
    {
      role: "user",
      content: `Question:\n${prompt}\n\nDraft answer:\n${original}\n\nConstructively critique the draft, then return only the improved answer.`,
    },
  ]);
}

function judgeMerge(prompt: string, a: string, b: string): Promise<string> {
  return callKilo(ULTRA_MODEL, [
    {
      role: "user",
      content: `Question:\n${prompt}\n\nAnswer A:\n${a}\n\nAnswer B:\n${b}\n\nCompare both improved answers. Where they disagree on facts you cannot verify, present both views labeled instead of guessing. Merge into one final answer and return only that answer.`,
    },
  ]);
}

function readStringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function readDataString(event: unknown, key: string): string | undefined {
  if (typeof event !== "object" || event === null) return undefined;
  const data = (event as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default Plugin.define({
  id: "multi-model-consensus",

  setup(ctx) {
    const log = createDebug("multi-model-consensus");

    void log.debug("plugin initialized", {
      config: {
        kiloBaseUrl: KILO_BASE_URL,
        flashModel: FLASH_MODEL,
        ultraModel: ULTRA_MODEL,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        toolSkipWindowMs: TOOL_SKIP_WINDOW_MS,
      },
    });

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      if (event.type !== "session.deleted") return;
      const sessionID = readDataString(event, "sessionID");
      if (!sessionID) return;
      void log.debug("session.deleted, cleaning up", { session: sessionID });
      enabledSessions.delete(sessionID);
      lastToolUse.delete(sessionID);
    });

    void ctx.command.transform((editor) => {
      editor.add({
        name: "consensus",
        description: "Toggle multi-model consensus review. Usage: /consensus on|off",
        async execute(input: { sessionID: string; prompt: unknown }) {
          const sessionID = readStringField(input, "sessionID");
          if (!sessionID) return;
          const arg = (readPromptText(input.prompt) ?? "").trim().toLowerCase();

          await log.debug("consensus command received", { session: sessionID, arg });
          if (arg === "on") {
            enabledSessions.set(sessionID, true);
            await log.info("consensus mode enabled", { session: sessionID });
          } else if (arg === "off") {
            enabledSessions.set(sessionID, false);
            await log.info("consensus mode disabled", { session: sessionID });
          } else {
            const state = enabledSessions.get(sessionID) ? "on" : "off";
            await log.debug("consensus mode queried", { session: sessionID, state });
          }
        },
      });
    });

    void ctx.tool.hook("execute.after", async (event) => {
      const sessionID = event.sessionID;
      if (typeof sessionID !== "string" || sessionID.length === 0) return;
      if (event.tool === "consensus_review") return;
      await log.debug("tool executed, updating lastToolUse", { session: sessionID, tool: event.tool });
      lastToolUse.set(sessionID, Date.now());
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "consensus_review",
        description:
          "Run multi-model consensus over a text-only draft answer. Call this when consensus mode is on (/consensus on) and the turn needs no tools: pass the user prompt and the draft answer, then present the returned text as the final answer.",
        input: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The original user prompt or question." },
            original: { type: "string", description: "The draft answer to critique and improve." },
          },
          required: ["prompt", "original"],
        },
        async execute(input: unknown, context) {
          const sessionID = readStringField(context, "sessionID");
          if (!sessionID) return { output: "Error: session ID required" };

          const prompt = readStringField(input, "prompt") ?? "";
          const original = readStringField(input, "original") ?? "";

          await log.debug("consensus_review invoked", {
            session: sessionID,
            promptLength: prompt.length,
            originalLength: original.length,
          });
          if (!enabledSessions.get(sessionID)) {
            await log.debug("consensus disabled for session", { session: sessionID });
            return { output: "Consensus is off for this session. Keep the original answer." };
          }
          const lastTool = lastToolUse.get(sessionID);
          if (lastTool && Date.now() - lastTool < TOOL_SKIP_WINDOW_MS) {
            lastToolUse.delete(sessionID);
            await log.debug("consensus skipped due to recent tool use", { session: sessionID });
            return {
              output:
                "Consensus skipped: other tools ran recently, so this turn is not text-only. Keep the original answer.",
            };
          }
          await log.info("starting consensus process", {
            session: sessionID,
            models: [FLASH_MODEL, ULTRA_MODEL],
          });

          const settled = await Promise.allSettled([
            selfCritique(FLASH_MODEL, prompt, original),
            selfCritique(ULTRA_MODEL, prompt, original),
          ]);
          const improved = settled
            .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
            .map((r) => r.value);

          if (improved.length === 0) {
            await log.error("both consensus models failed", { session: sessionID });
            return { output: "Error: both consensus models failed; keep the original answer." };
          }
          if (improved.length === 1) {
            await log.warn("only one model succeeded, returning its result", {
              session: sessionID,
              model: improved.length,
            });
            return { output: improved[0] };
          }
          try {
            await log.debug("merging results with judge model", { session: sessionID, judgeModel: ULTRA_MODEL });
            return { output: await judgeMerge(prompt, improved[0], improved[1]) };
          } catch (e) {
            await log.warn("judge merge failed, returning first improved", {
              session: sessionID,
              error: String(e),
            });
            return { output: improved[0] };
          }
        },
      });

      editor.add({
        name: "multi_model_consensus_debug",
        description: "Debug multi-model-consensus plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "enabled", "lastTool"],
              default: "state",
              description: "What to dump: state (all), enabled (mode state), lastTool (tracked tool usage)",
            },
          },
        },
        async execute(input: unknown) {
          const action = readStringField(input, "action");
          if (action === "enabled") {
            return { output: JSON.stringify({ enabled: Object.fromEntries(enabledSessions) }, null, 2) };
          }
          if (action === "lastTool") {
            return { output: JSON.stringify({ lastToolUse: Object.fromEntries(lastToolUse) }, null, 2) };
          }
          await log.stateDump("multi-model-consensus", {
            enabledSessions: Object.fromEntries(enabledSessions),
            lastToolUse: Object.fromEntries(lastToolUse),
            config: {
              kiloBaseUrl: KILO_BASE_URL,
              flashModel: FLASH_MODEL,
              ultraModel: ULTRA_MODEL,
              requestTimeoutMs: REQUEST_TIMEOUT_MS,
              toolSkipWindowMs: TOOL_SKIP_WINDOW_MS,
            },
          });
          return { output: "State dumped to debug outputs (console, file, client.app.log)" };
        },
      });
    });

    void ctx.session.hook("context", async (event) => {
      const sessionID = event.sessionID;
      if (typeof sessionID !== "string" || sessionID.length === 0) return;
      if (!Array.isArray(event.system)) return;

      const state = enabledSessions.get(sessionID) ? "on" : "off";
      await log.debug("context adding consensus notice", { session: sessionID, state });

      event.system = [
        ...event.system,
        {
          type: "text",
          text:
            `CONSENSUS MODE (${state}): the multi-model-consensus plugin provides a consensus_review tool (Kilo step-3.7-flash:free + nemotron-ultra:free self-critique, nemotron judge-merge). ` +
            `When the mode is on and the turn is text-only (no tool calls needed), call consensus_review with the user prompt and the draft answer, then present the returned text as the final answer. ` +
            `Toggle with /consensus on|off. Never present tool-call turns as text-only.`,
        },
      ];
    });

    return () => {
      enabledSessions.clear();
      lastToolUse.clear();
    };
  },
});

/** Extracts the argument text from a slash-command invocation. */
function readPromptText(prompt: unknown): string | undefined {
  if (typeof prompt !== "object" || prompt === null) return undefined;
  const direct = readStringField(prompt, "text");
  if (direct) return direct;
  const parts = (prompt as { parts?: unknown }).parts;
  if (Array.isArray(parts)) {
    const chunks = parts
      .map((part) => readStringField(part, "text"))
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    if (chunks.length > 0) return chunks.join("\n");
  }
  return undefined;
}