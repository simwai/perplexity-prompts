/**
 * OpenCode AutoTitle plugin (V2)
 *
 * Sets a session title in two phases:
 *   Phase 1 (fast): as soon as the user's first message is seen, a keyword
 *                   based title is written so the sidebar is never blank.
 *   Phase 2 (slow): after the session goes idle, an AI model writes a more
 *                   specific title built from the exchange.
 *
 * V2 changes:
 *   - `export default Plugin.define(...)` replaces the V1 async-function export.
 *     The V1 build also exported test helpers plus a non-callable constant, which
 *     aborted opencode's loader; nothing is exported now.
 *   - The V2 event bus has no `message.part.updated`, so Phase 1 reads the first
 *     user message from the `context` session hook's `event.messages`.
 *     `session.idle` still exists and drives Phase 2.
 *   - SDK calls are flat inputs (`ctx.session.update({ sessionID, title })`), not
 *     the V1 `{ path, body }` wrapper, and provider discovery uses
 *     `ctx.provider.list()` rather than the removed `client.config.providers()`.
 *   - Session history comes from `ctx.session.context()`, not
 *     `client.session.messages()`.
 */

import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { Plugin } from "@opencode/plugin";
import { createDebug } from "../../lib/baba-debug";
import { subscribeToEvents } from "../../lib/baba-session-id";

const EMOJI_KEYWORD = "\u{1F50D}";
const EMOJI_AI = "\u2728";

const CHEAP_MODEL_PATTERNS = [
  /fast/i,
  /flash/i,
  /haiku/i,
  /mini/i,
  /instant/i,
  /small/i,
  /lite/i,
  /turbo/i,
  /8b/i,
  /7b/i,
];

interface Config {
  model: string | null;
  provider: string | null;
  maxLength: number;
  disabled: boolean;
  debug: false | true | string;
}

interface ModelRef {
  providerID: string;
  modelID: string;
}

interface Logger {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  error: (msg: string) => void;
}

interface State {
  keywordTitled: Set<string>;
  aiTitled: Set<string>;
  pendingAI: Set<string>;
}

function loadConfig(): Config {
  const env = process.env;
  const debugEnv = env.OPENCODE_AUTOTITLE_DEBUG;

  let debug: false | true | string = false;
  if (debugEnv) {
    if (debugEnv === "1" || debugEnv === "true") debug = true;
    else if (debugEnv !== "0" && debugEnv !== "false") debug = debugEnv;
  }

  return {
    model: env.OPENCODE_AUTOTITLE_MODEL || null,
    provider: env.OPENCODE_AUTOTITLE_PROVIDER || null,
    maxLength: Number(env.OPENCODE_AUTOTITLE_MAX_LENGTH) || 60,
    disabled:
      env.OPENCODE_AUTOTITLE_DISABLED === "1" || env.OPENCODE_AUTOTITLE_DISABLED === "true",
    debug,
  };
}

function createLogger(debug: false | true | string): Logger {
  const isEnabled = !!debug;
  const logFile = typeof debug === "string" ? debug : null;

  let logPath: string | null = null;
  if (logFile) {
    logPath = path.isAbsolute(logFile) ? logFile : path.resolve(process.cwd(), logFile);
    try {
      const dir = path.dirname(logPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(logPath, `[autotitle] Log started at ${new Date().toISOString()}\n`);
    } catch {
      logPath = null;
    }
  }

  const log = (level: string, msg: string): void => {
    if ((level === "debug" || level === "info") && !isEnabled) return;
    const timestamp = new Date().toISOString();
    const line = `[autotitle] ${timestamp} ${level.toUpperCase()}: ${msg}`;
    if (logPath) {
      try {
        appendFileSync(logPath, line + "\n");
      } catch {
        console.error(line);
      }
    } else if (isEnabled || level === "error") {
      console.error(line);
    }
  };

  return {
    debug: (msg: string) => log("debug", msg),
    info: (msg: string) => log("info", msg),
    error: (msg: string) => log("error", msg),
  };
}

function findCheapestFromModels(modelIds: readonly string[], log: Logger): string | null {
  if (modelIds.length === 0) return null;

  log.debug(`Available models: ${modelIds.slice(0, 10).join(", ")}${modelIds.length > 10 ? "..." : ""}`);

  for (const pattern of CHEAP_MODEL_PATTERNS) {
    const match = modelIds.find((id) => pattern.test(id));
    if (match) {
      log.debug(`Found cheap model by pattern ${pattern}: ${match}`);
      return match;
    }
  }
  log.debug(`No cheap model pattern matched, using first: ${modelIds[0]}`);
  return modelIds[0] || null;
}

function isTimestampTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  if (title.trim() === "") return true;
  const timestampPatterns = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/,
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i,
    /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
    /^Session\s+\d+/i,
    /^New\s+Session/i,
    /^Untitled/i,
  ];
  return timestampPatterns.some((pattern) => pattern.test(title.trim()));
}

function hasPluginEmoji(title: string | null | undefined): boolean {
  if (!title) return false;
  return title.startsWith(EMOJI_KEYWORD) || title.startsWith(EMOJI_AI);
}

function shouldModifyTitle(title: string | null | undefined): boolean {
  return isTimestampTitle(title) || hasPluginEmoji(title);
}

function sanitizeTitle(title: string, maxLength: number): string {
  return title
    .replace(/[^\w\s.\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
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

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  const seen = new Set<string>();
  const uniqueWords: string[] = [];
  for (const word of words) {
    if (!seen.has(word)) {
      seen.add(word);
      uniqueWords.push(word);
    }
  }
  return uniqueWords.slice(0, 6);
}

function generateFallbackTitle(text: string, maxLength: number): string {
  const cleanedText = text.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  if (cleanedText.length <= maxLength && cleanedText.length > 3) {
    return cleanedText
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  const keywords = extractKeywords(text);
  if (keywords.length === 0) return "";

  let title = "";
  for (const keyword of keywords) {
    const capitalized = keyword.charAt(0).toUpperCase() + keyword.slice(1);
    const potential = title ? `${title} ${capitalized}` : capitalized;
    if (potential.length <= maxLength) title = potential;
    else break;
  }
  return sanitizeTitle(title, maxLength);
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Newest user message text from the context hook's message list. */
function newestUserText(messages: readonly unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { type?: unknown; text?: unknown; parts?: unknown };
    // V2 message info tags the role via `type`; older shapes used `role`.
    const role = message.type ?? (message as { role?: unknown }).role;
    if (role !== "user") continue;

    const direct = readText(message.text);
    if (direct) return direct;

    if (Array.isArray(message.parts)) {
      for (const part of message.parts) {
        const text = readText((part as { text?: unknown }).text);
        if ((part as { type?: unknown }).type === "text" && text) return text;
      }
    }
  }
  return undefined;
}

export default Plugin.define({
  id: "opencode-autotitle",

  setup(ctx) {
    const config = loadConfig();
    const log = createLogger(config.debug);
    const babaLog = createDebug("opencode-autotitle");

    log.info(`AutoTitle initializing (disabled=${config.disabled})`);
    void babaLog.debug("plugin initialized", {
      config: { ...config, debug: undefined },
      cheapModelPatterns: CHEAP_MODEL_PATTERNS.map((p) => p.source),
    });

    if (config.disabled) {
      log.info("Plugin is disabled via OPENCODE_AUTOTITLE_DISABLED");
      void babaLog.info("plugin disabled via config");
      return () => {};
    }

    const state: State = {
      keywordTitled: new Set(),
      aiTitled: new Set(),
      pendingAI: new Set(),
    };

    log.info("AutoTitle plugin initialized");
    void babaLog.info("plugin initialized");

    async function updateTitle(sessionId: string, title: string): Promise<boolean> {
      try {
        await ctx.session.update({ sessionID: sessionId, title });
        log.debug(`Updated session ${sessionId} title to: ${title}`);
        return true;
      } catch (err: unknown) {
        log.error(`Failed to update session title: ${err instanceof Error ? err.message : "unknown"}`);
        return false;
      }
    }

    async function getSessionTitle(sessionId: string): Promise<string | undefined> {
      try {
        const response = await ctx.session.get({ sessionID: sessionId });
        return readText(response?.title);
      } catch {
        return undefined;
      }
    }

    /** First user and first assistant text, from the session context. */
    async function getSessionMessages(sessionId: string): Promise<{
      user: string | null;
      assistant: string | null;
    }> {
      try {
        const response = await ctx.session.context({ sessionID: sessionId });
        const messages = Array.isArray(response) ? response : [];
        let user: string | null = null;
        let assistant: string | null = null;

        for (const entry of messages) {
          const info = entry as { type?: unknown; text?: unknown; role?: unknown; parts?: unknown };
          const role = info.type ?? info.role;
          if (role !== "user" && role !== "assistant") continue;

          const text = readText(info.text)
            ?? readText((info.parts as { text?: unknown }[] | undefined)?.[0]?.text);
          if (!text) continue;

          if (role === "user" && !user) user = text;
          else if (role === "assistant" && !assistant) assistant = text;
          if (user && assistant) break;
        }
        return { user, assistant };
      } catch {
        return { user: null, assistant: null };
      }
    }

    async function findCheapestModel(): Promise<ModelRef | null> {
      if (config.model) {
        const [providerID, modelID] = config.model.includes("/")
          ? (config.model.split("/", 2) as [string, string])
          : (["anthropic", config.model] as [string, string]);
        log.debug(`Using configured model: ${providerID}/${modelID}`);
        return { providerID, modelID };
      }

      try {
        const [providersResult, modelsResult] = await Promise.all([
          ctx.provider.list(),
          ctx.model.list(),
        ]);

        const providers = Array.isArray(providersResult?.data) ? providersResult.data : [];
        const models = Array.isArray(modelsResult?.data) ? modelsResult.data : [];

        // V2 exposes connected providers through `activation`, not a separate list.
        const connected = new Set(
          providers
            .filter((p) => p.activation === "enabled")
            .map((p) => p.id),
        );

        const candidates = models.map((m) => ({
          id: m.id,
          providerID: m.providerID,
          modelID: m.modelID,
          connected: connected.has(m.providerID),
        }));

        if (config.provider) {
          const scoped = candidates.filter((c) => c.providerID === config.provider);
          const cheap = findCheapestFromModels(scoped.map((c) => c.id), log);
          const found = scoped.find((c) => c.id === cheap);
          if (found) return { providerID: found.providerID, modelID: found.modelID };
        }

        log.debug(`Found ${candidates.length} models across ${providers.length} providers`);

        // Prefer a cheap model on a connected provider: respects the user's
        // current provider choice and avoids an unnecessary provider switch.
        for (const connectedFirst of [true, false]) {
          const pool = candidates.filter((c) => c.connected === connectedFirst);
          for (const pattern of CHEAP_MODEL_PATTERNS) {
            const match = pool.find((c) => pattern.test(c.id));
            if (match) {
              log.debug(`Selected ${match.providerID}/${match.modelID} via ${pattern}`);
              return { providerID: match.providerID, modelID: match.modelID };
            }
          }
        }
        log.debug("No models found in any provider");
      } catch (err: unknown) {
        log.debug(`Failed to fetch providers: ${err instanceof Error ? err.message : "unknown"}`);
      }
      return null;
    }

    async function generateAITitle(
      sessionId: string,
      userMessage: string,
      assistantMessage: string | null,
    ): Promise<string | null> {
      let modelToUse: ModelRef | null = null;
      try {
        modelToUse = await findCheapestModel();
      } catch (err: unknown) {
        log.debug(`Model discovery failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
      if (!modelToUse) {
        log.debug("No model available for AI title generation");
        return null;
      }

      let context = `User asked: "${userMessage.slice(0, 300)}"`;
      if (assistantMessage) {
        context += `\n\nAssistant responded: "${assistantMessage.slice(0, 400)}"`;
      }
      const prompt =
        `Generate a concise, specific title (3-6 words) for this conversation:\n\n${context}\n\n` +
        `Rules:\n` +
        `- MUST NOT exceed ${config.maxLength} characters - this is a hard limit\n` +
        `- No quotes or special punctuation (but keep dots in filenames like AGENTS.md, package.json)\n` +
        `- Use title case\n` +
        `- Be SPECIFIC about the actual content discussed\n` +
        `- If there's a ticket/issue reference, include it as a prefix\n` +
        `- Return ONLY the title, nothing else`;

      let tempSessionId: string | null = null;
      try {
        log.debug("Creating temp session for AI title generation");
        // SessionPromptInput has no model field, so the model is pinned on the
        // temp session at creation time.
        const tempSession = await ctx.session.create({
          title: "autotitle-temp",
          model: { id: modelToUse.modelID, providerID: modelToUse.providerID },
        });
        tempSessionId = tempSession.id;
        log.debug(`Created temp session ${tempSessionId}, sending prompt`);

        const response = await ctx.session.prompt({
          sessionID: tempSessionId,
          text: prompt,
        });

        const parts = (response as { parts?: unknown }).parts;
        const partList = Array.isArray(parts) ? parts : [];
        for (const part of partList) {
          const text = readText((part as { type?: unknown; text?: unknown }).text);
          if ((part as { type?: unknown }).type !== "text" || !text) continue;
          const lines = text.split("\n").filter((l) => l.trim());
          const candidate = lines[0] || text;
          if (candidate.length > 0 && candidate.length <= config.maxLength + 20) {
            const title = sanitizeTitle(candidate, config.maxLength);
            log.debug(`AI generated title: "${title}"`);
            return title;
          }
        }
        log.debug("No valid title in AI response");
      } catch (err: unknown) {
        log.debug(`AI generation failed: ${err instanceof Error ? err.message : "unknown"}`);
      } finally {
        if (tempSessionId) {
          await ctx.session.remove({ sessionID: tempSessionId }).catch(() => {});
        }
      }
      return null;
    }

    async function handleUserMessage(sessionId: string, userText: string): Promise<void> {
      if (state.keywordTitled.has(sessionId) || state.aiTitled.has(sessionId)) return;

      const currentTitle = await getSessionTitle(sessionId);
      if (!shouldModifyTitle(currentTitle)) {
        log.debug(`Session ${sessionId} has custom title, skipping: ${currentTitle}`);
        state.aiTitled.add(sessionId);
        return;
      }

      const keywordTitle = generateFallbackTitle(userText, config.maxLength - 2);
      if (!keywordTitle) {
        log.debug(`Could not generate keyword title for session ${sessionId}`);
        return;
      }

      const fullTitle = `${EMOJI_KEYWORD} ${keywordTitle}`;
      if (await updateTitle(sessionId, fullTitle)) {
        log.info(`Set keyword title: ${fullTitle}`);
        state.keywordTitled.add(sessionId);
      }
    }

    async function handleSessionIdle(sessionId: string): Promise<void> {
      if (state.aiTitled.has(sessionId)) return;
      if (state.pendingAI.has(sessionId)) return;

      const currentTitle = await getSessionTitle(sessionId);
      if (!shouldModifyTitle(currentTitle)) {
        log.debug(`Session ${sessionId} has custom title, skipping: ${currentTitle}`);
        state.aiTitled.add(sessionId);
        return;
      }

      state.pendingAI.add(sessionId);
      try {
        const { user, assistant } = await getSessionMessages(sessionId);
        if (!user) {
          state.pendingAI.delete(sessionId);
          return;
        }
        const title = await generateAITitle(sessionId, user, assistant);
        if (title) {
          const fullTitle = `${EMOJI_AI} ${title}`;
          if (await updateTitle(sessionId, fullTitle)) {
            log.info(`Set AI title: ${fullTitle}`);
            state.aiTitled.add(sessionId);
          }
        }
      } finally {
        state.pendingAI.delete(sessionId);
      }
    }

    // Phase 1 replacement: the V2 bus has no message.part.updated, so the first
    // user message is read from the context hook's own message list.
    void ctx.session.hook("context", async (event) => {
      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;
      if (!Array.isArray(event.messages)) return;
      if (state.keywordTitled.has(sessionId) || state.aiTitled.has(sessionId)) return;

      const userText = newestUserText(event.messages);
      if (!userText) return;

      void handleUserMessage(sessionId, userText).catch((err: unknown) => {
        log.debug(`Error in handleUserMessage: ${err instanceof Error ? err.message : "unknown"}`);
      });
    });

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      if (event.type !== "session.idle") return;
      const data = (event as { data?: unknown }).data;
      if (typeof data !== "object" || data === null) return;
      const sessionId = (data as Record<string, unknown>).sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;
      log.debug(`Session idle: ${sessionId}`);
      void handleSessionIdle(sessionId).catch((err: unknown) => {
        log.debug(`Error in handleSessionIdle: ${err instanceof Error ? err.message : "unknown"}`);
      });
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "opencode_autotitle_debug",
        description: "Debug opencode-autotitle plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "config", "sessions"],
              default: "state",
              description: "What to dump: state (all), config (plugin config), sessions (title state per session)",
            },
          },
        },
        async execute() {
          await babaLog.stateDump("opencode-autotitle", {
            config: { ...config, debug: undefined },
            keywordTitled: [...state.keywordTitled],
            aiTitled: [...state.aiTitled],
            pendingAI: [...state.pendingAI],
          });
          return { output: "State dumped to debug outputs (console, file)" };
        },
      });
    });

    return () => {
      state.keywordTitled.clear();
      state.aiTitled.clear();
      state.pendingAI.clear();
    };
  },
});