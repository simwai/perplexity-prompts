/**
 * Prompt System Loader Plugin for opencode (V2)
 *
 * Tracks which prompt-system/*.md files have been loaded this session and
 * blocks assistant output until the full set has been read before entering a
 * new phase.
 *
 * The required file set is discovered from the filesystem at session creation
 * time -- no hardcoded list, no drift.
 *
 * V2 changes:
 *   - `tool.execute.after` moved to `ctx.tool.hook("execute.after")`; tool args
 *     are read from `event.input.filePath` rather than `input.args.filePath`.
 *   - The blocking behaviour still runs from the `context` session hook (the
 *     successor to `experimental.chat.messages.transform`), but it now prepends
 *     the blocking notice to `event.system` instead of replacing the last
 *     message's parts. Same effect for the model, no message-part surgery.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

interface LoaderState {
  requiredFiles: Set<string>;
  loadedFiles: Set<string>;
  lastNotifiedPhase: string;
  planVersion: number; // 1 = initial, 2 = post-reload after PLAN v1 approval
}

const loaderStates = new Map<string, LoaderState>();

function relativePromptSystemPath(absPath: string, directory: string): string {
  const normalized = absPath.replace(/\\/g, "/");
  const root = directory.replace(/\\/g, "/");
  if (normalized.startsWith(root + "/")) {
    return normalized.slice(root.length + 1);
  }
  return normalized;
}

/**
 * Required files are enumerated from disk rather than through client.find.files.
 *
 * find.files takes a query object of { directory?, query, dirs? } and returns
 * a flat string array; it has no `type` field, so the previous call passed an
 * argument the SDK does not define and the call threw into the catch below.
 * That left the required set empty on every session, and an empty set makes
 * the enforcement gate return early -- which is why the loader never once
 * blocked output in the runtime log.
 */
async function discoverRequiredFiles(directory: string): Promise<Set<string>> {
  const files = new Set<string>();
  try {
    const entries = await readdir(join(directory, "prompt-system"), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".md")) continue;
      files.add(`prompt-system/${entry.name}`);
    }
  } catch (e: unknown) {
    // Discovery unavailable; enforcement degrades to advisory-only.
    console.log(`[prompt-system-loader] discovery failed: ${(e as Error).message}`);
  }
  return files;
}

function getOrCreateState(sessionId: string, required: Set<string>): LoaderState {
  let state = loaderStates.get(sessionId);
  if (!state) {
    state = {
      requiredFiles: required,
      loadedFiles: new Set(),
      lastNotifiedPhase: "STARTUP",
      planVersion: 1,
    };
    loaderStates.set(sessionId, state);
  } else if (required.size > 0) {
    state.requiredFiles = required;
  }
  return state;
}

function detectPhase(messages: readonly unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = (messages[i] as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const text = (part as { type?: unknown; text?: unknown }).text;
      if ((part as { type?: unknown }).type !== "text" || typeof text !== "string") continue;
      const match = text.match(/^\[PHASE:\s*([A-Z_]+)\]/m);
      if (match) return match[1];
    }
  }
  return undefined;
}

function readStringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export default Plugin.define({
  id: "baba-prompt-system-loader",

  setup(ctx) {
    const directory = ctx.location.directory;
    const log = createDebug("baba-prompt-system-loader");

    void log.debug("plugin initialized", { directory });

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      if (event.type !== "session.created" && event.type !== "session.deleted") return;
      const sessionId = readDataString(event, "sessionID");
      if (!sessionId) return;

      if (event.type === "session.created") {
        const required = await discoverRequiredFiles(directory);
        loaderStates.set(sessionId, {
          requiredFiles: required,
          loadedFiles: new Set(),
          lastNotifiedPhase: "STARTUP",
          planVersion: 1,
        });
        await log.debug("session.created, discovering required files", {
          session: sessionId,
          requiredCount: required.size,
        });
        return;
      }

      void log.debug("session.deleted, cleaning up", { session: sessionId });
      loaderStates.delete(sessionId);
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "baba_prompt_system_loader_debug",
        description: "Debug baba-prompt-system-loader plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "sessions"],
              default: "state",
              description: "What to dump: state (all), sessions (loader states per session)",
            },
          },
        },
        async execute(input: unknown) {
          const action = readStringField(input, "action") ?? "state";
          if (action === "sessions") {
            const sessions: Record<string, unknown> = {};
            for (const [id, state] of loaderStates) {
              sessions[id] = {
                requiredFiles: [...state.requiredFiles],
                loadedFiles: [...state.loadedFiles],
                lastNotifiedPhase: state.lastNotifiedPhase,
                planVersion: state.planVersion,
              };
            }
            return { output: JSON.stringify(sessions, null, 2) };
          }
          await log.stateDump("baba-prompt-system-loader", {
            sessionCount: loaderStates.size,
            sessions: Object.fromEntries(loaderStates),
          });
          return { output: "State dumped to debug outputs (console, file, client.app.log)" };
        },
      });
    });

    void ctx.tool.hook("execute.after", async (event) => {
      if (event.tool !== "read") return;
      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;

      const readPath = readStringField(event.input, "filePath");
      if (!readPath) return;

      const state = getOrCreateState(sessionId, new Set());
      const rel = relativePromptSystemPath(readPath, directory);
      if (state.requiredFiles.has(rel)) {
        state.loadedFiles.add(rel);
        await log.debug("prompt-system file loaded", {
          session: sessionId,
          file: rel,
          loadedCount: state.loadedFiles.size,
          requiredCount: state.requiredFiles.size,
        });
      }
    });

    void ctx.session.hook("context", async (event) => {
      const messages = event.messages;
      if (!Array.isArray(messages) || messages.length === 0) return;

      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;

      const state = loaderStates.get(sessionId);
      if (!state || state.requiredFiles.size === 0) return;
      if (state.loadedFiles.size === state.requiredFiles.size) return;

      const detectedPhase = detectPhase(messages);
      if (!detectedPhase || detectedPhase === state.lastNotifiedPhase) return;

      // PLAN v1 -> v2 transition: force full reload after PLAN v1 approval
      if (detectedPhase === "PLAN" && state.planVersion === 1) {
        state.planVersion = 2;
        state.loadedFiles.clear();
        await log.info("PLAN v1->v2 transition, forcing full reload", { session: sessionId });
        return;
      }

      const missing = [...state.requiredFiles].filter((f) => !state.loadedFiles.has(f));
      state.lastNotifiedPhase = detectedPhase;

      if (missing.length === 0) {
        await log.info("reading plan complete", { session: sessionId, scope: state.requiredFiles.size });
        return;
      }

      const list = missing.map((f) => `- ${f}`).join("\n");
      const blockingContent =
        `PROMPT SYSTEM LOADER: The full prompt system has not been loaded this session.\n` +
        `Missing files:\n${list}\n` +
        `Assistant output for [PHASE: ${detectedPhase}] is held until all required files are loaded. Please read the missing files first.`;

      await log.warn("blocking output due to missing prompt-system files", {
        session: sessionId,
        phase: detectedPhase,
        missingCount: missing.length,
        missingFiles: missing,
      });

      if (!Array.isArray(event.system)) return;
      event.system = [{ type: "text", text: blockingContent }, ...event.system];
    });

    return () => {
      loaderStates.clear();
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