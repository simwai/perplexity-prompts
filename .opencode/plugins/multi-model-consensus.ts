import { type Plugin, tool } from "@opencode-ai/plugin";
import { createDebug } from "../lib/baba-debug";

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
  const data = (await res.json()) as any;
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

async function notify(_ctx: any, message: string): Promise<void> {
  // TUI notifications removed; no-op.
}

export default async (_ctx: any): Promise<any> => {
  const log = createDebug("multi-model-consensus", _ctx?.client);

  await log.debug("plugin initialized", {
    config: {
      kiloBaseUrl: KILO_BASE_URL,
      flashModel: FLASH_MODEL,
      ultraModel: ULTRA_MODEL,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      toolSkipWindowMs: TOOL_SKIP_WINDOW_MS,
    },
  });

  return {
    tool: {
      consensus_review: tool({
        description:
          "Run multi-model consensus over a text-only draft answer. Call this when consensus mode is on (/consensus on) and the turn needs no tools: pass the user prompt and the draft answer, then present the returned text as the final answer.",
        args: {
          prompt: tool.schema.string().describe("The original user prompt or question."),
          original: tool.schema.string().describe("The draft answer to critique and improve."),
        },
        async execute(args, context) {
          const { sessionID } = context;
          if (!sessionID) {
            return "Error: session ID required";
          }
          await log.debug("consensus_review invoked", { session: sessionID, promptLength: args.prompt.length, originalLength: args.original.length });
          if (!enabledSessions.get(sessionID)) {
            await log.debug("consensus disabled for session", { session: sessionID });
            return "Consensus is off for this session. Keep the original answer.";
          }
          const lastTool = lastToolUse.get(sessionID);
          if (lastTool && Date.now() - lastTool < TOOL_SKIP_WINDOW_MS) {
            lastToolUse.delete(sessionID);
            await log.debug("consensus skipped due to recent tool use", { session: sessionID });
            return "Consensus skipped: other tools ran recently, so this turn is not text-only. Keep the original answer.";
          }
          await log.info("starting consensus process", { session: sessionID, models: [FLASH_MODEL, ULTRA_MODEL] });
          const settled = await Promise.allSettled([
            selfCritique(FLASH_MODEL, args.prompt, args.original),
            selfCritique(ULTRA_MODEL, args.prompt, args.original),
          ]);
          const improved = settled
            .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
            .map((r) => r.value);
          if (improved.length === 0) {
            await log.error("both consensus models failed", { session: sessionID });
            return "Error: both consensus models failed; keep the original answer.";
          }
          if (improved.length === 1) {
            await log.warn("only one model succeeded, returning its result", { session: sessionID, model: improved.length });
            return improved[0];
          }
          try {
            await log.debug("merging results with judge model", { session: sessionID, judgeModel: ULTRA_MODEL });
            return await judgeMerge(args.prompt, improved[0], improved[1]);
          } catch (e) {
            await log.warn("judge merge failed, returning first improved", { session: sessionID, error: String(e) });
            return improved[0];
          }
        },
      }),

      multi_model_consensus_debug: tool({
        description: "Debug multi-model-consensus plugin: dump internal state.",
        args: {
          action: tool.schema
            .enum(["state", "enabled", "lastTool"])
            .default("state")
            .describe("What to dump: state (all), enabled (mode state), lastTool (tracked tool usage)"),
        },
        async execute(args) {
          const action = args.action ?? "state";
          switch (action) {
            case "enabled":
              return JSON.stringify({ enabled: Object.fromEntries(enabledSessions) }, null, 2);
            case "lastTool":
              return JSON.stringify({ lastToolUse: Object.fromEntries(lastToolUse) }, null, 2);
            case "state":
            default: {
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
              return "State dumped to debug outputs (console, file, client.app.log)";
            }
          }
        },
      }),
    },

    "command.execute.before": async (input: { command: string; sessionID?: string; arguments?: string }) => {
      const { command, sessionID, arguments: rawArgs } = input;
      if (!sessionID || command !== "consensus") return;
      const arg = (rawArgs ?? "").trim().toLowerCase();
      await log.debug("consensus command received", { session: sessionID, arg });
      if (arg === "on") {
        enabledSessions.set(sessionID, true);
        await log.info("consensus mode enabled", { session: sessionID });
        await notify(_ctx, "Consensus mode on: text-only turns run multi-model review.");
      } else if (arg === "off") {
        enabledSessions.set(sessionID, false);
        await log.info("consensus mode disabled", { session: sessionID });
        await notify(_ctx, "Consensus mode off.");
      } else {
        const state = enabledSessions.get(sessionID) ? "on" : "off";
        await notify(_ctx, `Consensus mode is ${state}. Use /consensus on|off.`);
      }
    },

    "tool.execute.after": async (input: { tool: string; sessionID?: string }) => {
      const { tool: toolName, sessionID } = input;
      if (!sessionID || toolName === "consensus_review") return;
      await log.debug("tool executed, updating lastToolUse", { session: sessionID, tool: toolName });
      lastToolUse.set(sessionID, Date.now());
    },

    "experimental.chat.system.transform": async (
      { sessionID }: { sessionID?: string },
      { system }: { system: string[] },
    ) => {
      if (!sessionID) return;
      const state = enabledSessions.get(sessionID) ? "on" : "off";
      await log.debug("system transform adding consensus notice", { session: sessionID, state });
      system.push(
        `CONSENSUS MODE (${state}): the multi-model-consensus plugin provides a consensus_review tool (Kilo step-3.7-flash:free + nemotron-ultra:free self-critique, nemotron judge-merge). ` +
          `When the mode is on and the turn is text-only (no tool calls needed), call consensus_review with the user prompt and the draft answer, then present the returned text as the final answer. ` +
          `Toggle with /consensus on|off. Never present tool-call turns as text-only.`,
      );
    },

    event: async ({ event }: { event: any }) => {
      if (event.type === "session.deleted") {
        const sessionID = (event as any).properties?.sessionID;
        if (sessionID) {
          await log.debug("session.deleted, cleaning up", { session: sessionID });
          enabledSessions.delete(sessionID);
          lastToolUse.delete(sessionID);
        }
      }
    },
  };
};
