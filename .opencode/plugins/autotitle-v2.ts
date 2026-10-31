/**
 * AutoTitle V2 — Automatic Session Naming Plugin for opencode (V2)
 *
 * Replaces V1 hooks from opencode-autotitle:
 *   - event (message.part.updated, session.idle) -> ctx.event.subscribe()
 *
 * V2 changes:
 *   - Uses ctx.event.subscribe() for session events
 *   - Session title updates via ctx.session.update()
 *   - Session queries via ctx.session.get(), ctx.session.messages()
 *   - Model selection via ctx.provider.list(), ctx.config.providers()
 *   - Temp session creation via ctx.session.create() for AI title generation
 *   - Config via environment variables (OPENCODE_AUTOTITLE_*)
 *   - Debug logging via baba-debug
 *
 * Two-phase titling:
 *   1. Quick keyword-based title on first user message (🔍 prefix)
 *   2. AI-generated title on session idle after assistant responds (✨ prefix)
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

/* ---------- Config ---------- */

interface AutoTitleConfig {
  model: string | null;           // "provider/model" or null for auto
  provider: string | null;        // specific provider ID or null
  maxLength: number;              // max title length
  disabled: boolean;              // disabled flag
  debug: boolean | string;        // false, true, or file path
}

function loadConfig(): AutoTitleConfig {
  const env = process.env;
  const debugEnv = env.OPENCODE_AUTOTITLE_DEBUG;
  let debug: boolean | string = false;
  if (debugEnv) {
    if (debugEnv === "1" || debugEnv === "true") debug = true;
    else if (debugEnv !== "0" && debugEnv !== "false") debug = debugEnv; // file path
  }
  return {
    model: env.OPENCODE_AUTOTITLE_MODEL ?? null,
    provider: env.OPENCODE_AUTOTITLE_PROVIDER ?? null,
    maxLength: Number(env.OPENCODE_AUTOTITLE_MAX_LENGTH) ?? 60,
    disabled: env.OPENCODE_AUTOTITLE_DISABLED === "1" || env.OPENCODE_AUTOTITLE_DISABLED === "true",
    debug,
  };
}

/* ---------- Title Logic ---------- */

const EMOJI_KEYWORD = "🔍";
const EMOJI_AI = "✨";

const CHEAP_MODEL_PATTERNS = [
  /fast/i, /flash/i, /haiku/i, /mini/i, /instant/i, /small/i, /lite/i, /turbo/i, /8b/i, /7b/i,
];

function findCheapestFromModels(models: any[], log: any): string | null {
  let modelIds: string[] = [];
  if (Array.isArray(models)) {
    modelIds = models.map(m => m.id || m.name || m).filter(id => typeof id === "string");
  } else if (models && typeof models === "object") {
    modelIds = Object.keys(models);
  }
  if (modelIds.length === 0) return null;
  log.debug(`Available models: ${modelIds.slice(0, 10).join(", ")}${modelIds.length > 10 ? "..." : ""}`);
  for (const pattern of CHEAP_MODEL_PATTERNS) {
    const match = modelIds.find(id => pattern.test(id));
    if (match) { log.debug(`Found cheap model by pattern ${pattern}: ${match}`); return match; }
  }
  log.debug(`No cheap model pattern matched, using first: ${modelIds[0]}`);
  return modelIds[0] ?? null;
}

const TIMESTAMP_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}/, /^\d{1,2}\/\d{1,2}\/\d{2,4}/,
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i,
  /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
  /^Session\s+\d+/i, /^New\s+Session/i, /^Untitled/i,
];

function isTimestampTitle(title: string | undefined): boolean {
  if (!title || title.trim() === "") return true;
  return TIMESTAMP_PATTERNS.some(p => p.test(title.trim()));
}

function hasPluginEmoji(title: string | undefined): boolean {
  if (!title) return false;
  return title.startsWith(EMOJI_KEYWORD) || title.startsWith(EMOJI_AI);
}

function shouldModifyTitle(title: string | undefined): boolean {
  if (isTimestampTitle(title)) return true;
  if (hasPluginEmoji(title)) return true;
  return false;
}

function sanitizeTitle(title: string, maxLength: number): string {
  return title.replace(/[^\w\s.\-]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "under", "again", "further", "then", "once", "here",
  "there", "when", "where", "why", "how", "all", "each", "few",
  "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "own", "same", "so", "than", "too", "very", "just",
  "and", "but", "if", "or", "because", "until", "while", "this",
  "that", "these", "those", "i", "me", "my", "myself", "we", "our",
  "you", "your", "he", "him", "his", "she", "her", "it", "its",
  "they", "them", "their", "what", "which", "who", "whom", "please",
  "help", "want", "like", "make", "create", "write", "add", "get",
  "came", "come", "goes", "going", "went", "give", "gave", "take", "took",
  "put", "see", "saw", "know", "knew", "think", "thought", "tell", "told",
  "ask", "asked", "use", "used", "find", "found", "let", "try", "tried",
  "look", "looking", "need", "needed", "seem", "seemed", "work", "working",
]);

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) if (!seen.has(w)) { seen.add(w); unique.push(w); }
  return unique.slice(0, 6);
}

function inferIntent(text: string): string {
  const t = text.toLowerCase();
  if (/\b(test|pytest|jest|spec|vitest|testing)\b/.test(t)) return "testing";
  if (/\b(debug|trace|breakpoint|stack|error|issue)\b/.test(t)) return "debugging";
  if (/\b(fix|bug|broken|patch|resolve)\b/.test(t)) return "fix";
  if (/\b(refactor|cleanup|reorganize|restructure|clean)\b/.test(t)) return "refactor";
  if (/\b(doc|readme|documentation|comment)\b/.test(t)) return "docs";
  if (/\b(review|pr|pull.?request)\b/.test(t)) return "review";
  if (/\b(deploy|docker|k8s|terraform|ci|cd|pipeline)\b/.test(t)) return "devops";
  if (/\b(api|endpoint|route|controller)\b/.test(t)) return "api";
  if (/\b(ui|frontend|component|style|css)\b/.test(t)) return "ui";
  if (/\b(database|db|sql|query|migration)\b/.test(t)) return "database";
  if (/\b(auth|login|password|session|token)\b/.test(t)) return "auth";
  if (/\b(config|setup|install|configure)\b/.test(t)) return "setup";
  return "";
}

function generateFallbackTitle(text: string, maxLength: number): string {
  const keywords = extractKeywords(text);
  const cleanedText = text.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  if (cleanedText.length <= maxLength && cleanedText.length > 3) {
    return cleanedText.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  if (keywords.length === 0) return "";
  let title = "";
  for (const kw of keywords) {
    const cap = kw.charAt(0).toUpperCase() + kw.slice(1);
    const potential = title ? `${title} ${cap}` : cap;
    if (potential.length <= maxLength) title = potential; else break;
  }
  return sanitizeTitle(title, maxLength);
}

/* ---------- V2 Plugin ---------- */

export default Plugin.define({
  id: "autotitle-v2",

  async setup(ctx: any) {
    const config = loadConfig();
    const log = createDebug("autotitle-v2", ctx);

    await log.debug("plugin initialized", { directory: ctx.location.directory, ...config });

    if (config.disabled) {
      await log.info("Plugin disabled via OPENCODE_AUTOTITLE_DISABLED");
      return;
    }

    /* ---- State ---- */
    const state = {
      keywordTitledSessions: new Set<string>(),
      aiTitledSessions: new Set<string>(),
      pendingAISessions: new Set<string>(),
      cheapestModel: null as { providerID: string; modelID: string } | null,
    };

    /* ---- Helpers ---- */

    async function updateTitle(sessionId: string, title: string): Promise<boolean> {
      try {
        // V2 session.update expects { id, title }
        await (ctx.session.update as any)({ id: sessionId, title } as any);
        await log.debug(`Updated session ${sessionId} title to: ${title}`);
        return true;
      } catch (err) {
        await log.error(`Failed to update session title: ${err instanceof Error ? err.message : "unknown"}`);
        return false;
      }
    }

    async function getSessionTitle(sessionId: string): Promise<string | undefined> {
      try {
        const resp = await (ctx.session.get as any)({ id: sessionId });
        return (resp as any)?.title;
      } catch { return undefined; }
    }

    async function getSessionMessages(sessionId: string): Promise<{ user: string | null; assistant: string | null }> {
      try {
        const resp = await (ctx.session.messages as any)({ id: sessionId });
        const messages = (resp as any)?.messages ?? (resp as any)?.data ?? [];
        let user: string | null = null, assistant: string | null = null;
        for (const msg of messages) {
          const role = (msg as any)?.info?.role || (msg as any)?.role;
          const parts = (msg as any)?.parts || [];
          for (const part of parts) {
            if (part?.type === "text" && part?.text) {
              if (role === "user" && !user) user = part.text;
              else if (role === "assistant" && !assistant) assistant = part.text;
              break;
            }
          }
          if (user && assistant) break;
        }
        return { user, assistant };
      } catch { return { user: null, assistant: null }; }
    }

    /* ---- Find cheapest model ---- */

    async function findCheapestModel(log: any): Promise<{ providerID: string; modelID: string } | null> {
      if (config.model) {
        const [providerID, modelID] = config.model.includes("/")
          ? config.model.split("/", 2) : ["anthropic", config.model];
        log.debug(`Using configured model: ${providerID}/${modelID}`);
        return { providerID, modelID };
      }
      try {
        // Get connected providers
        let connectedProviderIds: string[] = [];
        try {
          const providerResp = await (ctx.provider.list as any)();
          const providerData = (providerResp as any)?.data || providerResp;
          connectedProviderIds = (providerData as any)?.connected || [];
          log.debug(`Connected providers: ${connectedProviderIds.join(", ") || "none"}`);
        } catch (e) { log.debug(`Failed to fetch connected providers: ${e instanceof Error ? e.message : "unknown"}`); }

        const providersResp = await (ctx.config.providers as any)?.() ?? (ctx.provider.list as any)?.();
        const responseData = (providersResp as any)?.data || providersResp;
        const providers = (responseData as any)?.providers || [];
        log.debug(`Found ${providers.length} providers`);

        if (config.provider) {
          const provider = providers.find((p: any) => p.id === config.provider);
          if (provider) {
            const cheap = findCheapestFromModels((provider as any).models || [], log);
            if (cheap) return { providerID: config.provider, modelID: cheap };
          }
        }

        const connectedProviders = providers.filter((p: any) => connectedProviderIds.includes(p.id));
        const otherProviders = providers.filter((p: any) => !connectedProviderIds.includes(p.id));
        const sorted = [...connectedProviders, ...otherProviders];
        if (connectedProviders.length > 0) {
          log.debug(`Prioritizing ${connectedProviders.length} connected provider(s): ${connectedProviders.map((p: any) => p.id).join(", ")}`);
        }

        for (const provider of sorted) {
          const cheap = findCheapestFromModels((provider as any).models || [], log);
          if (cheap) { log.debug(`Selected ${provider.id}/${cheap}`); return { providerID: provider.id, modelID: cheap }; }
        }
        log.debug("No models found in any provider");
      } catch (e) { log.debug(`Failed to fetch providers: ${e instanceof Error ? e.message : "unknown"}`); }
      return null;
    }

    /* ---- AI Title Generation ---- */

    async function generateAITitle(
      sessionId: string,
      userMessage: string,
      assistantMessage: string | null,
      modelToUse: { providerID: string; modelID: string } | null,
      log: any
    ): Promise<string | null> {
      let context = `User asked: "${userMessage.slice(0, 300)}"`;
      if (assistantMessage) context += `\n\nAssistant responded: "${assistantMessage.slice(0, 400)}"`;

      const prompt = `Generate a concise, specific title (3-6 words) for this conversation:

${context}

Rules:
- MUST NOT exceed ${config.maxLength} characters - this is a hard limit
- No quotes or special punctuation (but keep dots in filenames like AGENTS.md, package.json)
- Use title case
- Be SPECIFIC about the actual content discussed (e.g., "British Shorthair Cat Photo" not "Image Identification")
- If the response mentions specific things (names, technologies, animals, etc.), include them
- If there's a ticket/issue reference (JIRA like ABC-123, GitHub PR #123, Trello, Linear, etc.), include it as a prefix (e.g., "ABC-123 Fix Login Bug")
- Return ONLY the title, nothing else`;

      let tempSessionId: string | null = null;
      try {
        log.debug("Creating temp session for AI title generation");
        const tempSession = await (ctx.session.create as any)({ title: "autotitle-temp" });
        tempSessionId = (tempSession as any)?.id || (tempSession as any)?.data?.id;
        if (!tempSessionId) { log.debug(`Failed to create temp session: ${JSON.stringify(tempSession).slice(0, 200)}`); return null; }
        log.debug(`Created temp session ${tempSessionId}, sending prompt`);

        const bodyConfig: any = { parts: [{ type: "text", text: prompt }] };
        if (modelToUse) { bodyConfig.model = modelToUse; log.debug(`Using model: ${modelToUse.providerID}/${modelToUse.modelID}`); }

        const response = await (ctx.session.prompt as any)({ id: tempSessionId, body: bodyConfig });
        log.debug(`Prompt response: ${JSON.stringify(response).slice(0, 300)}`);

        const parts = (response as any)?.parts || (response as any)?.data?.parts || [];
        for (const part of parts) {
          if (part?.type === "text" && part?.text) {
            const text = part.text.trim();
            const lines = text.split("\n").filter((l: string) => l.trim());
            const candidate = lines[0] || text;
            if (candidate.length > 0 && candidate.length <= config.maxLength + 20) {
              const title = sanitizeTitle(candidate, config.maxLength);
              log.debug(`AI generated title: "${title}"`);
              await (ctx.session.delete as any)({ id: tempSessionId }).catch(() => {});
              return title;
            }
          }
        }
        if ((response as any)?.content) {
          const title = sanitizeTitle((response as any).content, config.maxLength);
          log.debug(`AI generated title (content): "${title}"`);
          await (ctx.session.delete as any)({ id: tempSessionId }).catch(() => {});
          return title;
        }
        log.debug("No valid title in AI response");
      } catch (e) { log.debug(`AI generation failed: ${e instanceof Error ? e.message : "unknown"}`); }
      finally { if (tempSessionId) await (ctx.session.delete as any)({ id: tempSessionId }).catch(() => {}); }
      return null;
    }

    /* ---- Extract session ID from event ---- */

    function extractSessionId(event: any): string | null {
      return event?.data?.sessionID ?? event?.id ?? event?.sessionID ?? event?.session?.id ?? null;
    }

    /* ---- Phase 1: Keyword title on user message ---- */

    async function handleUserMessage(sessionId: string, userText: string) {
      if (state.keywordTitledSessions.has(sessionId) || state.aiTitledSessions.has(sessionId)) return;
      const currentTitle = await getSessionTitle(sessionId);
      if (!shouldModifyTitle(currentTitle)) {
        await log.debug(`Session ${sessionId} has custom title, skipping: ${currentTitle}`);
        state.aiTitledSessions.add(sessionId);
        return;
      }
      const keywordTitle = generateFallbackTitle(userText, config.maxLength - 2);
      if (!keywordTitle) { log.debug(`Could not generate keyword title for ${sessionId}`); return; }
      const fullTitle = `${EMOJI_KEYWORD} ${keywordTitle}`;
      if (await updateTitle(sessionId, fullTitle)) {
        await log.info(`Set keyword title: ${fullTitle}`);
        state.keywordTitledSessions.add(sessionId);
      }
    }

    /* ---- Phase 2: AI title on session idle ---- */

    async function handleSessionIdle(sessionId: string) {
      if (state.aiTitledSessions.has(sessionId) || state.pendingAISessions.has(sessionId)) return;
      const currentTitle = await getSessionTitle(sessionId);
      if (!shouldModifyTitle(currentTitle)) {
        log.debug(`Session ${sessionId} has custom title, skipping AI: ${currentTitle}`);
        state.aiTitledSessions.add(sessionId);
        return;
      }
      state.pendingAISessions.add(sessionId);
      try {
        const { user: userMessage, assistant: assistantMessage } = await getSessionMessages(sessionId);
        if (!userMessage) { log.debug(`No user message for ${sessionId}`); return; }
        log.debug(`Generating AI title for ${sessionId}`);
        log.debug(`User: ${userMessage.slice(0, 100)}...`);
        if (assistantMessage) log.debug(`Assistant: ${assistantMessage.slice(0, 100)}...`);

        if (!state.cheapestModel) {
          try {
            const found = await findCheapestModel(log);
            state.cheapestModel = found ?? null;
            if (state.cheapestModel) log.debug(`Selected model: ${state.cheapestModel.providerID}/${state.cheapestModel.modelID}`);
          } catch (e) { log.debug(`Failed to find cheap model: ${e instanceof Error ? e.message : "unknown"}`); state.cheapestModel = null; }
        }

        const aiTitle = await generateAITitle(sessionId, userMessage, assistantMessage, state.cheapestModel, log);
        if (aiTitle) {
          const fullTitle = `${EMOJI_AI} ${aiTitle}`;
          if (await updateTitle(sessionId, fullTitle)) {
            log.info(`Set AI title: ${fullTitle}`);
            state.aiTitledSessions.add(sessionId);
            state.keywordTitledSessions.delete(sessionId);
          }
        } else {
          log.debug(`AI title generation failed for ${sessionId}`);
          if (state.keywordTitledSessions.has(sessionId)) state.aiTitledSessions.add(sessionId);
        }
      } catch (err) { log.error(`Failed to generate AI title: ${err instanceof Error ? err.message : "unknown"}`); }
      finally { state.pendingAISessions.delete(sessionId); }
    }

    /* ---- Event subscriptions ---- */

    void subscribeToEvents(ctx.event.subscribe(), async (event: any) => {
      const e = event;
      if (config.debug) log.debug(`Event: ${e?.type} - ${JSON.stringify(e).slice(0, 500)}`);

      // Phase 1: message.part.updated for user message
      if (e?.type === "message.part.updated") {
        const part = e?.data?.part;
        const sessionId = part?.sessionID;
        if (sessionId && part?.type === "text" && part?.text) {
          if (!state.keywordTitledSessions.has(sessionId) && !state.aiTitledSessions.has(sessionId)) {
            handleUserMessage(sessionId, part.text).catch(err => log.debug(`Error in handleUserMessage: ${err instanceof Error ? err.message : "unknown"}`));
          }
        }
      }

      // Phase 2: session.idle after AI responds
      if (e?.type === "session.idle") {
        const sessionId = extractSessionId(e);
        if (sessionId) {
          handleSessionIdle(sessionId).catch(err => log.debug(`Error in handleSessionIdle: ${err instanceof Error ? err.message : "unknown"}`));
        }
      }
    });

    /* ---- Debug tool ---- */
    void ctx.tool.transform((editor: any) => {
      editor.add({
        name: "autotitle_debug",
        description: "Debug autotitle-v2 plugin: dump internal state.",
        input: { type: "object", properties: { action: { type: "string", enum: ["state", "sessions", "config"], default: "state" } } },
        async execute(input: unknown) {
          const action = typeof input === "object" && input !== null && "action" in input ? String((input as any).action) : "state";
          if (action === "sessions") {
            return { output: JSON.stringify({
              keywordTitled: [...state.keywordTitledSessions],
              aiTitled: [...state.aiTitledSessions],
              pendingAI: [...state.pendingAISessions],
              cheapestModel: state.cheapestModel,
            }, null, 2) };
          }
          if (action === "config") return { output: JSON.stringify(config, null, 2) };
          await log.stateDump("autotitle-v2", { ...state, config });
          return { output: "State dumped to debug outputs" };
        },
      });
    });
  },
});