/**
 * Baba Goal Detection Plugin for opencode (V2)
 *
 * Watches the first user message in a session. If the message looks like a
 * free-text goal (no concrete target) AND the user has not already invoked a
 * command, surfaces a one-time suggestion to run /kickoff.
 *
 * Heuristics (conservative -- one false positive per session max, dismissible):
 *   Goal-like:   contains action verbs (build|create|implement|add|make|develop|set up|write)
 *                AND a noun phrase after the verb
 *   Not a goal:  mentions a file path (./, src/, @, .ts, .py, .md), a bug report
 *                (bug, fix, broken, error, crash), a line number, or starts with
 *                a slash command (already explicit)
 *
 * V2 change: the V2 event bus has no `message.part.updated` or `message.updated`
 * events, so user text cannot be accumulated from the bus. It is read straight
 * off the `context` session hook's `event.messages`, which also removes the
 * defer-to-next-tick hack the old bus path needed.
 *
 * V2 change: the V1 delivery used `client.session.prompt({ noReply: true })`,
 * which no longer exists. The suggestion is prepended to `event.system` on the
 * same model request that carried the goal, so no extra turn is spent on it.
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

const GOAL_VERB = /\b(build|create|implement|implementing|add|make|develop|set\s+up|write|ship|ship a|scaffold|introduce|integrate)\b/i;
const TARGET_HINTS = /(\.[a-z]{1,4}\b|^\s*\/|@|line\s+\d|l\d+\b|src\/|app\/|lib\/|\/[a-z-]+\.[a-z])/i;
const BUG_HINTS = /\b(bug|fix|broken|error|crash|fail|fails|regression|hotfix|stack trace|exception)\b/i;
const QUESTION_ONLY = /^(how|what|why|when|where|can you explain|is there)\b/i;

const SUGGESTION = `Goal-like first message detected. Suggested next step: run /kickoff with the goal text to bootstrap roadmap -> sprint -> stories -> ICE scores -> task card in one consolidated flow. If this is already a concrete target, ignore this note.`;

/** Sessions already assessed, so the check runs on the first message only. */
const assessed = new Set<string>();

/** Newest user message text from the session history. */
function newestUserText(messages: readonly unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { role?: unknown; parts?: unknown } | null;
    if (!message || message.role !== "user") continue;
    if (!Array.isArray(message.parts)) continue;
    const chunks: string[] = [];
    for (const part of message.parts) {
      const text = (part as { type?: unknown; text?: unknown }).text;
      const type = (part as { type?: unknown }).type;
      const synthetic = (part as { synthetic?: unknown }).synthetic;
      if (type !== "text" || typeof text !== "string") continue;
      if (synthetic === true) continue;
      if (text.length === 0) continue;
      chunks.push(text);
    }
    if (chunks.length === 0) continue;
    return chunks.join("\n").trim();
  }
  return undefined;
}

function isGoalLike(text: string): boolean {
  if (text.startsWith("/")) return false;        // already a command
  if (TARGET_HINTS.test(text)) return false;     // concrete target
  if (BUG_HINTS.test(text)) return false;        // bug report
  if (QUESTION_ONLY.test(text)) return false;    // question / exploration
  if (!GOAL_VERB.test(text)) return false;       // no goal verb
  if (text.length < 40) return false;            // too short to be a goal
  return true;
}

export default Plugin.define({
  id: "baba-goal-detect",

  setup(ctx) {
    const log = createDebug("baba-goal-detect");

    void log.debug("plugin initialized", {
      patterns: {
        goalVerb: GOAL_VERB.source,
        targetHints: TARGET_HINTS.source,
        bugHints: BUG_HINTS.source,
        questionOnly: QUESTION_ONLY.source,
      },
    });

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      if (event.type !== "session.deleted") return;
      const data = (event as { data?: unknown }).data;
      if (typeof data !== "object" || data === null) return;
      const sessionId = (data as Record<string, unknown>).sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;
      void log.debug("session.deleted, cleaning up", { sessionId });
      assessed.delete(sessionId);
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "baba_goal_detect_debug",
        description: "Debug baba-goal-detect plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "assessed", "messages"],
              default: "state",
              description:
                "What to dump: state (all), assessed (assessed sessions), messages (message tracking)",
            },
          },
        },
        async execute(input: unknown) {
          const action = readStringField(input, "action") ?? "state";
          if (action === "assessed") {
            return { output: JSON.stringify({ assessed: [...assessed] }, null, 2) };
          }
          await log.stateDump("baba-goal-detect", {
            assessedCount: assessed.size,
            assessed: [...assessed],
          });
          return { output: "State dumped to debug outputs (console, file, client.app.log)" };
        },
      });
    });

    void ctx.session.hook("context", async (event) => {
      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;
      if (assessed.has(sessionId)) return;
      if (!Array.isArray(event.messages)) return;

      const text = newestUserText(event.messages);
      if (!text) return;

      assessed.add(sessionId);
      const isGoal = isGoalLike(text);

      void log.debug("goal assessment complete", {
        sessionId,
        textLength: text.length,
        isGoal,
        textPreview: text.slice(0, 100),
      });

      if (!isGoal) return;

      await log.info("goal detected, injecting kickoff suggestion", { sessionId });
      if (!Array.isArray(event.system)) return;
      event.system = [{ type: "text", text: SUGGESTION }, ...event.system];
    });

    return () => {
      assessed.clear();
    };
  },
});

function readStringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}