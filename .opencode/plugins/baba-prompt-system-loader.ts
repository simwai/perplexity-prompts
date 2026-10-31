/**
 * Prompt System Loader Plugin for opencode (V2)
 *
 * Tracks which prompt-system/*.md files have been loaded this session and
 * blocks assistant output until the phase-relevant tier has been read before
 * entering a new phase.
 *
 * Two tiers from `prompt-system/system-manifest.json`:
 *   - loadOrder.always: required from the first phase transition (STARTUP).
 *   - loadOrder.reviewPatch: additionally required once the session enters a
 *     core-work phase (REVIEW / PLAN / PATCH / DOCS / DRIFT and children).
 * See `prompt-system/00-system.md` `## Load order` for the source contract.
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
import { readFileSync } from "node:fs";
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
 * The loader enforces two tiers of files, from `prompt-system/system-manifest.json`:
 *
 *   - `loadOrder.always`      -- required from the first phase transition (STARTUP).
 *   - `loadOrder.reviewPatch` -- additionally required once the session enters a
 *     core-work phase (REVIEW / PLAN / PATCH / DOCS / DRIFT and their children).
 *
 * If the manifest cannot be parsed, the loader falls back to requiring every
 * top-level prompt-system/*.md file (the pre-tier behavior), so a broken
 * manifest degrades to superset enforcement rather than no enforcement.
 */
const REVIEW_PATCH_PHASES = new Set([
  "CHECKLIST",
  "DOCS",
  "REVIEW",
  "TEST_STRATEGY",
  "TEST_STRATEGY_QUANT",
  "PLAN",
  "DESIGN_PLAN",
  "HANDOFF",
  "PATCH",
  "DRIFT"
]);

function isPromptSystemFile(rel: string): boolean {
  return rel.startsWith("prompt-system/") && rel.endsWith(".md");
}

function loadManifestTiers(directory: string): { always: string[]; reviewPatch: string[] } {
  try {
    const raw = readFileSync(join(directory, "prompt-system", "system-manifest.json"), "utf8");
    const manifest = JSON.parse(raw) as { loadOrder?: { always?: string[]; reviewPatch?: string[] } };
    return {
      always: manifest.loadOrder?.always ?? [],
      reviewPatch: manifest.loadOrder?.reviewPatch ?? []
    };
  } catch {
    // Manifest unavailable or unparseable.
    return { always: [], reviewPatch: [] };
  }
}

/**
 * The [core] tier. AGENTS.md is excluded: it is pinned in the host instructions
 * array rather than read via the read tool, so requiring it here would block
 * output forever on hosts that pin it.
 */
async function discoverRequiredFiles(directory: string): Promise<Set<string>> {
  const files = new Set<string>();
  try {
    const tiers = loadManifestTiers(directory);
    for (const rel of tiers.always) {
      if (isPromptSystemFile(rel)) files.add(rel);
    }
    if (files.size === 0) throw new Error("manifest produced an empty always tier");
  } catch (e: unknown) {
    console.log(`[prompt-system-loader] manifest tier discovery failed: ${(e as Error).message}`);
    const entries = await readdir(join(directory, "prompt-system"), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".md")) continue;
      files.add(`prompt-system/${entry.name}`);
    }
  }
  return files;
}

/** The required set for a phase: [core] always, [review] for core-work phases. */
function requiredForPhase(directory: string, phase: string): Set<string> {
  const files = new Set<string>();
  const tiers = loadManifestTiers(directory);
  for (const rel of tiers.always) {
    if (isPromptSystemFile(rel)) files.add(rel);
  }
  if (REVIEW_PATCH_PHASES.has(phase)) {
    for (const rel of tiers.reviewPatch) {
      if (isPromptSystemFile(rel)) files.add(rel);
    }
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
      if (!state) return;

      const detectedPhase = detectPhase(messages);
      if (!detectedPhase || detectedPhase === state.lastNotifiedPhase) return;

      // PLAN v1 -> v2 transition: force full reload after PLAN v1 approval
      if (detectedPhase === "PLAN" && state.planVersion === 1) {
        state.planVersion = 2;
        state.lastNotifiedPhase = detectedPhase;
        state.requiredFiles = requiredForPhase(directory, detectedPhase);
        state.loadedFiles.clear();
        await log.info("PLAN v1->v2 transition, forcing full reload", { session: sessionId });
        return;
      }

      const required = requiredForPhase(directory, detectedPhase);
      if (required.size === 0) return;
      state.requiredFiles = required;
      const missing = [...required].filter((f) => !state.loadedFiles.has(f));
      state.lastNotifiedPhase = detectedPhase;

      if (missing.length === 0) {
        await log.info("reading plan complete", { session: sessionId, scope: required.size });
        return;
      }

      const list = missing.map((f) => `- ${f}`).join("\n");
      const blockingContent =
        `PROMPT SYSTEM LOADER: Tiered required files (manifest loadOrder) have not all been loaded for this phase.\n` +
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