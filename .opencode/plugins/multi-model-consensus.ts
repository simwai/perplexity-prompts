/**
 * Multi-Model Consensus plugin for opencode (V3)
 *
 * Runs a text-only draft through two discovered models for self-critique and
 * merges the results with a judge model. Off by default; `/consensus on`
 * enables it per session. The tool skips any turn where other tools already
 * ran, so a tool-calling turn is never presented as text-only.
 *
 * V3 changes:
 *   - Model roles are auto-discovered from the Kilo gateway catalog
 *     (`GET /models`) instead of hardcoded IDs. Free models always qualify;
 *     paid models from the preferred families join the pool when
 *     `KILO_API_KEY` is set (the key is the opt-in) under a price ceiling.
 *   - Authorization comes from the `KILO_API_KEY` env var when set, falling
 *     back to the anonymous bearer. The key is never hardcoded.
 *   - Calls carry a clamped `max_tokens` (default 16384) and enable reasoning
 *     at the highest effort the catalog advertises ("max"/"xhigh"/"high"/...
 *     for effort-type models, a plain toggle for on/off models).
 *   - Free models rank above paid ones in role selection; paid models from
 *     the preferred families only fill roles the free pool cannot cover.
 *   - A 404 from a chat call invalidates the catalog cache, so a removed
 *     model heals on the next turn instead of failing forever.
 *   - V2 API surface unchanged: `ctx.command.transform` owns the `consensus`
 *     command, `ctx.tool.hook("execute.after")` tracks tool use,
 *     `ctx.session.hook("context")` appends the mode notice.
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

const KILO_BASE_URL = "https://api.kilo.ai/api/gateway";

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readEnvFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const CATALOG_TTL_MS = readEnvInt("CONSENSUS_CATALOG_TTL_MS", 30 * 60_000);
const CATALOG_TIMEOUT_MS = readEnvInt("CONSENSUS_CATALOG_TIMEOUT_MS", 15_000);
const REQUEST_TIMEOUT_MS = readEnvInt("CONSENSUS_REQUEST_TIMEOUT_MS", 180_000);
const MAX_TOKENS_DESIRED = readEnvInt("CONSENSUS_MAX_TOKENS", 16_384);
const TOOL_SKIP_WINDOW_MS = readEnvInt("CONSENSUS_TOOL_SKIP_WINDOW_MS", 60_000);
const MAX_PROMPT_PRICE = readEnvFloat("CONSENSUS_MAX_PROMPT_PRICE", 0.000001);
const FAMILY_PREFERENCE = (process.env.CONSENSUS_FAMILIES ?? "nemotron,glm,step")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const EXPLICIT_JUDGE = process.env.CONSENSUS_JUDGE?.trim() || undefined;
const EXPLICIT_CRITICS = (process.env.CONSENSUS_CRITICS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const KILO_API_KEY = process.env.KILO_API_KEY?.trim() || undefined;

// Known family aliases map catalog vendors onto preference names; a family
// name with no alias is matched as a vendor prefix instead.
const FAMILY_PATTERNS: Array<[string, RegExp]> = [
  ["nemotron", /^nvidia\/nemotron/i],
  ["glm", /^(z-ai|zhipuai)\//i],
  ["step", /^stepfun\//i],
];
// Classifier and router endpoints are in the catalog but are not chat models.
const NON_CHAT_MODEL = /content.?safety|switchyard|guardrail/i;
// Reasoning-effort ladder, strongest first; "none" is deliberately absent so
// effort selection never degrades thinking on models that offer it.
const EFFORT_RANK = ["max", "xhigh", "high", "medium", "low", "minimal"] as const;

type KiloMessage = {
  role: string;
  content: string;
};

type KiloResponse = {
  choices?: { message?: { content?: unknown } }[];
};

type CatalogModel = {
  id: string;
  isFree: boolean;
  promptPrice: number;
  contextLength: number;
  maxCompletionTokens: number;
  reasoningSupport: boolean;
  reasoningToggle: boolean;
  reasoningEfforts: string[];
};

type RoleSet = {
  judge: string;
  critics: string[];
  byId: Map<string, CatalogModel>;
  source: string;
};

const enabledSessions = new Map<string, boolean>();
const lastToolUse = new Map<string, number>();
let catalogCache: { at: number; models: CatalogModel[] } | null = null;
let lastGoodRoles: RoleSet | null = null;

function invalidateCatalog(): void {
  catalogCache = null;
}

function familyOf(id: string): string | undefined {
  for (const [name, pattern] of FAMILY_PATTERNS) {
    if (pattern.test(id)) return name;
  }
  const vendor = id.split("/")[0]?.toLowerCase();
  return vendor && FAMILY_PREFERENCE.includes(vendor) ? vendor : undefined;
}

function inPreferredFamily(id: string): boolean {
  const family = familyOf(id);
  return family !== undefined && FAMILY_PREFERENCE.includes(family);
}

// Parses the parameter count embedded in model IDs ("...-550b-a55b" -> 550)
// as a capability proxy for ranking; context length breaks ties.
function paramBillion(id: string): number {
  const match = id.match(/(\d+(?:\.\d+)?)b/i);
  return match ? Number.parseFloat(match[1]) : 0;
}

async function fetchCatalog(log: ReturnType<typeof createDebug>): Promise<CatalogModel[]> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.models;
  }
  const res = await fetch(`${KILO_BASE_URL}/models`, {
    headers: { Authorization: KILO_API_KEY ? `Bearer ${KILO_API_KEY}` : "Bearer anonymous" },
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`catalog HTTP ${res.status}`);
  }
  const data = (await res.json()) as { data?: unknown };
  const models: CatalogModel[] = [];
  for (const entry of Array.isArray(data?.data) ? data.data : []) {
    const m = entry as Record<string, any>;
    if (typeof m?.id !== "string") continue;
    const pricing = m.pricing as Record<string, unknown> | undefined;
    const topProvider = m.top_provider as Record<string, unknown> | undefined;
    const supported = Array.isArray(m.supported_parameters) ? (m.supported_parameters as unknown[]) : [];
    const reasoningOptions = (m.opencode as Record<string, any> | undefined)?.reasoning_options;
    const effortValues = Array.isArray(reasoningOptions?.values) ? reasoningOptions.values : [];
    models.push({
      id: m.id,
      isFree: m.isFree === true,
      promptPrice: Number.parseFloat(String(pricing?.prompt ?? "0")) || 0,
      contextLength: Number(topProvider && "context_length" in topProvider ? topProvider.context_length : m.context_length) || 0,
      maxCompletionTokens: Number(topProvider?.max_completion_tokens) || 0,
      reasoningSupport: supported.includes("reasoning"),
      reasoningToggle: reasoningOptions?.type === "toggle",
      reasoningEfforts: effortValues.filter((v: unknown): v is string => typeof v === "string"),
    });
  }
  catalogCache = { at: Date.now(), models };
  void log.debug("catalog fetched", { count: models.length });
  return models;
}

function rankModels(a: CatalogModel, b: CatalogModel): number {
  // Free first: the key unlocks paid fallbacks, but free models win every
  // role the free pool can cover; size then context break ties.
  return Number(b.isFree) - Number(a.isFree)
    || paramBillion(b.id) - paramBillion(a.id)
    || b.contextLength - a.contextLength;
}

function pickRoles(models: CatalogModel[]): RoleSet {
  const usable = models.filter(
    (m) =>
      !NON_CHAT_MODEL.test(m.id) &&
      inPreferredFamily(m.id) &&
      (m.isFree || (KILO_API_KEY !== undefined && m.promptPrice <= MAX_PROMPT_PRICE)),
  );
  const byId = new Map<string, CatalogModel>();
  let pool = [...usable].sort(rankModels);
  if (pool.length < 3) {
    // Not enough preferred-family models (e.g. no API key): widen with free
    // models from other vendors rather than failing the role assignment.
    const known = new Set(pool.map((m) => m.id));
    const extra = models
      .filter((m) => !NON_CHAT_MODEL.test(m.id) && m.isFree && !known.has(m.id))
      .sort(rankModels);
    pool = [...pool, ...extra];
  }
  for (const m of pool) byId.set(m.id, m);

  const judge = EXPLICIT_JUDGE ?? pool[0]?.id;
  if (!judge) {
    throw new Error("no usable models in catalog for the preferred families");
  }
  const rest = pool.filter((m) => m.id !== judge);
  const criticA = EXPLICIT_CRITICS[0] ?? rest.find((m) => familyOf(m.id) !== familyOf(judge))?.id ?? rest[0]?.id;
  if (!criticA) {
    throw new Error("no critic models available alongside the judge");
  }
  const remaining = rest.filter((m) => m.id !== criticA);
  const criticB =
    EXPLICIT_CRITICS[1] ?? remaining.find((m) => familyOf(m.id) !== familyOf(criticA))?.id ?? remaining[0]?.id;
  if (!criticB) {
    throw new Error("no second critic model available");
  }
  return {
    judge,
    critics: [criticA, criticB],
    byId,
    source: EXPLICIT_JUDGE || EXPLICIT_CRITICS.length > 0 ? "override+discovery" : "discovery",
  };
}

async function resolveRoles(log: ReturnType<typeof createDebug>): Promise<RoleSet> {
  try {
    const roles = pickRoles(await fetchCatalog(log));
    lastGoodRoles = roles;
    void log.debug("roles resolved", { judge: roles.judge, critics: roles.critics, source: roles.source });
    return roles;
  } catch (e) {
    if (lastGoodRoles) {
      await log.warn("catalog refresh failed, using last known roles", { error: String(e) });
      return lastGoodRoles;
    }
    throw e;
  }
}

async function callKilo(
  model: string,
  messages: KiloMessage[],
  info?: CatalogModel,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: Math.min(MAX_TOKENS_DESIRED, info?.maxCompletionTokens || MAX_TOKENS_DESIRED),
  };
  // Reasoning-capable endpoints think at the highest effort the catalog
  // advertises; on/off ("toggle") models just get thinking enabled.
  if (info?.reasoningSupport) {
    const effort = EFFORT_RANK.find((e) => info.reasoningEfforts.includes(e));
    if (info.reasoningToggle) {
      body.reasoning = { enabled: true };
    } else if (effort) {
      body.reasoning = { enabled: true, effort };
    }
  }
  const res = await fetch(`${KILO_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: KILO_API_KEY ? `Bearer ${KILO_API_KEY}` : "Bearer anonymous",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    if (res.status === 404) {
      invalidateCatalog();
    }
    throw new Error(`Kilo ${model} HTTP ${res.status}`);
  }
  const data = (await res.json()) as KiloResponse;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error(`Kilo ${model} empty response`);
  }
  return text.trim();
}

function selfCritique(
  model: string,
  info: CatalogModel | undefined,
  prompt: string,
  original: string,
): Promise<string> {
  return callKilo(model, [
    {
      role: "user",
      content: `Question:\n${prompt}\n\nDraft answer:\n${original}\n\nConstructively critique the draft, then return only the improved answer.`,
    },
  ], info);
}

function judgeMerge(
  model: string,
  info: CatalogModel | undefined,
  prompt: string,
  a: string,
  b: string,
): Promise<string> {
  return callKilo(model, [
    {
      role: "user",
      content: `Question:\n${prompt}\n\nAnswer A:\n${a}\n\nAnswer B:\n${b}\n\nCompare both improved answers. Where they disagree on facts you cannot verify, present both views labeled instead of guessing. Merge into one final answer and return only that answer.`,
    },
  ], info);
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
        apiKeyConfigured: KILO_API_KEY !== undefined,
        familyPreference: FAMILY_PREFERENCE,
        maxPromptPrice: MAX_PROMPT_PRICE,
        maxTokensDesired: MAX_TOKENS_DESIRED,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        catalogTtlMs: CATALOG_TTL_MS,
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
          "Run multi-model consensus over a text-only draft answer. Call this when consensus mode is on (/consensus on) and the turn needs no tools: pass the user prompt and the draft answer, then present the returned text as the final answer. Models are auto-discovered from the Kilo gateway catalog.",
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

          let roles: RoleSet;
          try {
            roles = await resolveRoles(log);
          } catch (e) {
            await log.error("model discovery failed", { session: sessionID, error: String(e) });
            return { output: "Error: model discovery failed; keep the original answer." };
          }
          await log.info("starting consensus process", {
            session: sessionID,
            judge: roles.judge,
            critics: roles.critics,
            source: roles.source,
          });

          const [criticA, criticB] = roles.critics;
          const settled = await Promise.allSettled([
            selfCritique(criticA, roles.byId.get(criticA), prompt, original),
            selfCritique(criticB, roles.byId.get(criticB), prompt, original),
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
            });
            return { output: improved[0] };
          }
          try {
            await log.debug("merging results with judge model", { session: sessionID, judgeModel: roles.judge });
            return { output: await judgeMerge(roles.judge, roles.byId.get(roles.judge), prompt, improved[0], improved[1]) };
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
              enum: ["state", "roles", "enabled", "lastTool"],
              default: "state",
              description:
                "What to dump: state (all), roles (discover model roles now), enabled (mode state), lastTool (tracked tool usage)",
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
          if (action === "roles") {
            try {
              const roles = await resolveRoles(log);
              const describe = (id: string) => {
                const info = roles.byId.get(id);
                return { id, isFree: info?.isFree ?? null, promptPrice: info?.promptPrice ?? null };
              };
              return {
                output: JSON.stringify(
                  { source: roles.source, judge: describe(roles.judge), critics: roles.critics.map(describe) },
                  null,
                  2,
                ),
              };
            } catch (e) {
              return { output: `Error: role discovery failed: ${String(e)}` };
            }
          }
          await log.stateDump("multi-model-consensus", {
            enabledSessions: Object.fromEntries(enabledSessions),
            lastToolUse: Object.fromEntries(lastToolUse),
            lastGoodRoles: lastGoodRoles
              ? { judge: lastGoodRoles.judge, critics: lastGoodRoles.critics, source: lastGoodRoles.source }
              : null,
            config: {
              kiloBaseUrl: KILO_BASE_URL,
              apiKeyConfigured: KILO_API_KEY !== undefined,
              familyPreference: FAMILY_PREFERENCE,
              maxPromptPrice: MAX_PROMPT_PRICE,
              maxTokensDesired: MAX_TOKENS_DESIRED,
              requestTimeoutMs: REQUEST_TIMEOUT_MS,
              catalogTtlMs: CATALOG_TTL_MS,
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
            `CONSENSUS MODE (${state}): the multi-model-consensus plugin provides a consensus_review tool ` +
            `(two auto-discovered Kilo models from families ${FAMILY_PREFERENCE.join(", ")} self-critique, then a judge model merges; ` +
            `free models always qualify, paid models in those families require the KILO_API_KEY env var). ` +
            `When the mode is on and the turn is text-only (no tool calls needed), call consensus_review with the user prompt and the draft answer, then present the returned text as the final answer. ` +
            `Toggle with /consensus on|off. Never present tool-call turns as text-only.`,
        },
      ];
    });

    return () => {
      enabledSessions.clear();
      lastToolUse.clear();
      invalidateCatalog();
      lastGoodRoles = null;
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
