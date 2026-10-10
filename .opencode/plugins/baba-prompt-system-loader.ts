/**
 * Prompt System Loader Plugin for opencode
 *
 * Tracks which prompt-system/*.md files have been loaded this session
 * and blocks assistant output until the full set has been read
 * before entering a new phase.
 *
 * The required file set is discovered from the filesystem at session
 * creation time -- no hardcoded list, no drift.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { sessionIdFromEvent } from "../lib/baba-session-id";

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
async function discoverRequiredFiles(
  client: any,
  directory: string,
): Promise<Set<string>> {
  const files = new Set<string>();
  try {
    const entries = await readdir(join(directory, "prompt-system"), {
      withFileTypes: true,
    });
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

export default async ({ client, $, project, directory, worktree }: {
  client: any;
  $: any;
  project: any;
  directory: string;
  worktree: string;
}) => {
  return {
    event: async ({ event }: { event: any }) => {
      const sessionId = sessionIdFromEvent(event.properties);
      if (!sessionId) return;

      if (event.type === "session.created") {
        const required = await discoverRequiredFiles(client, directory);
        loaderStates.set(sessionId, {
          requiredFiles: required,
          loadedFiles: new Set(),
          lastNotifiedPhase: "STARTUP",
          planVersion: 1,
        });
        return;
      }

      if (event.type === "session.deleted") {
        loaderStates.delete(sessionId);
        return;
      }
    },

    "tool.execute.after": async (input: {
      tool: string;
      sessionID: string;
      callID: string;
      args: any;
    }) => {
      const sessionId = input.sessionID;
      if (!sessionId) return;

      const state = loaderStates.get(sessionId);
      if (!state || state.requiredFiles.size === 0) return;

      if (input.tool === "read" && input.args?.filePath) {
        const rel = relativePromptSystemPath(input.args.filePath, directory);
        if (state.requiredFiles.has(rel)) {
          state.loadedFiles.add(rel);
        }
      }
    },

    "experimental.chat.messages.transform": async (
      input: Record<string, unknown>,
      output: { messages: any[] },
    ) => {
      const messages = output.messages;
      if (!messages || messages.length === 0) return;

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || !lastMessage.parts) return;

      // This hook's input is typed `{}` and carries no session id, so it is read
      // off the message info instead. Reading input.sessionID always yields
      // undefined and the gate below never runs.
      const sessionId =
        lastMessage.info?.sessionID ?? lastMessage.sessionID ?? sessionIdFromEvent(input);
      if (!sessionId) return;

      const state = loaderStates.get(sessionId);
      if (!state || state.requiredFiles.size === 0) return;

      let detectedPhase: string | undefined;
      for (const part of lastMessage.parts) {
        if (part.type !== "text" || !part.text) continue;
        const match = part.text.match(/^\[PHASE:\s*([A-Z_]+)\]/m);
        if (match) {
          detectedPhase = match[1];
          break;
        }
      }

      if (!detectedPhase || detectedPhase === state.lastNotifiedPhase) return;

      // PLAN v1 → v2 transition: force full reload after PLAN v1 approval
      if (detectedPhase === "PLAN" && state.planVersion === 1) {
        state.planVersion = 2;
        state.loadedFiles.clear(); // Forces full reload on next reads
        console.log("[prompt-system-loader] PLAN v1→v2: forcing full reload");
      }

      const missing = [...state.requiredFiles].filter(
        (f) => !state.loadedFiles.has(f),
      );

      if (missing.length > 0) {
        const list = missing.map((f) => `- ${f}`).join("\n");
        const blockingContent =
          `PROMPT SYSTEM LOADER: The full prompt system has not been loaded this session.\n` +
          `Missing files:\n${list}\n` +
          `Assistant output for [PHASE: ${detectedPhase}] is held until all required files are loaded. Please read the missing files first.`;

        if (lastMessage.role === "assistant") {
          lastMessage.parts = [{ type: "text", text: blockingContent }];
        } else {
          messages.push({
            role: "system",
            parts: [{ type: "text", text: blockingContent }],
          });
        }

        console.log(`[prompt-system-loader] BLOCKING output for ${detectedPhase} due to missing files:\n${list}`);
      }

      state.lastNotifiedPhase = detectedPhase;
    },
  };
};
