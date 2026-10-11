/**
 * Baba Goal Detection Plugin for opencode
 *
 * Watches the first user message in a session. If the message looks like a
 * free-text goal (no concrete target) AND the user has not already invoked a
 * command, surfaces a one-time suggestion to run /kickoff.
 *
 * Heuristics (conservative — one false positive per session max, dismissible):
 *   Goal-like:   contains action verbs (build|create|implement|add|make|develop|set up|write)
 *                AND a noun phrase after the verb
 *   Not a goal:  mentions a file path (./, src/, @, .ts, .py, .md), a bug report
 *                (bug, fix, broken, error, crash), a line number, or starts with
 *                a slash command (already explicit)
 *
 * Delivery is a noReply session prompt. The previous implementation used
 * client.message.create, which is not a method on the SDK client, and read
 * messages off a session.updated event, whose payload carries a Session object
 * with no messages on it. Both paths threw or returned early, so the plugin
 * never fired.
 *
 * User text comes from the event bus, not from chat.message's output.parts:
 * upstream anomalyco/opencode#22831 shows the runtime always hands that hook
 * an empty array, so reading it directly no-ops live. message.part.updated
 * carries the real text.
 */

import { sessionIdFromEvent } from "../lib/baba-session-id";
import { createDebug } from "../lib/baba-debug";
import { tool } from "@opencode-ai/plugin";

const GOAL_VERB = /\b(build|create|implement|implementing|add|make|develop|set\s+up|write|ship|ship a|scaffold|introduce|integrate)\b/i;
const TARGET_HINTS = /(\.[a-z]{1,4}\b|^\s*\/|@|line\s+\d|l\d+\b|src\/|app\/|lib\/|\/[a-z-]+\.[a-z])/i;
const BUG_HINTS = /\b(bug|fix|broken|error|crash|fail|fails|regression|hotfix|stack trace|exception)\b/i;
const QUESTION_ONLY = /^(how|what|why|when|where|can you explain|is there)\b/i;

const SUGGESTION = `Goal-like first message detected. Suggested next step: run /kickoff with the goal text to bootstrap roadmap → sprint → stories → ICE scores → task card in one consolidated flow. If this is already a concrete target, ignore this note.`;

/** Sessions already assessed, so the check runs on the first message only. */
const assessed = new Set<string>();

/** Text parts seen per message, keyed by message id, accumulated from the bus. */
const messageText = new Map<string, string[]>();

function collectText(part: any): void {
  if (!part || typeof part !== "object") return;
  if (part.type !== "text" || typeof part.text !== "string") return;
  if (part.synthetic === true || part.ignored === true) return;
  if (part.text.length === 0) return;

  const key = part.messageID;
  if (typeof key !== "string") return;
  const chunks = messageText.get(key) ?? [];
  chunks.push(part.text);
  messageText.set(key, chunks);
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

export default async ({ client, $, project, directory, worktree }: {
  client: any;
  $: any;
  project: any;
  directory: string;
  worktree: string;
}) => {
  const log = createDebug("baba-goal-detect", client);

  await log.debug("plugin initialized", {
    patterns: {
      goalVerb: GOAL_VERB.source,
      targetHints: TARGET_HINTS.source,
      bugHints: BUG_HINTS.source,
      questionOnly: QUESTION_ONLY.source,
    },
  });

  async function suggest(sessionId: string): Promise<void> {
    try {
      await log.debug("sending kickoff suggestion", { session: sessionId });
      await client.session.prompt({
        path: { id: sessionId },
        body: {
          noReply: true,
          parts: [{ type: "text", text: SUGGESTION }],
        },
      });
      await log.info("kickoff suggestion sent", { session: sessionId });
    } catch (e) {
      await log.warn("failed to send kickoff suggestion", { session: sessionId, error: String(e) });
      // A failed suggestion is not worth surfacing: it is advisory, and the
      // user can always invoke /kickoff themselves.
    }
  }

  return {
    tool: {
      baba_goal_detect_debug: tool({
        description: "Debug baba-goal-detect plugin: dump internal state.",
        args: {
          action: tool.schema
            .enum(["state", "assessed", "messages"])
            .default("state")
            .describe("What to dump: state (all), assessed (assessed sessions), messages (message tracking)"),
        },
        async execute(args) {
          const action = args.action ?? "state";
          switch (action) {
            case "assessed":
              return JSON.stringify({ assessed: Array.from(assessed) }, null, 2);
            case "messages": {
              const msgs: Record<string, string[]> = {};
              for (const [id, chunks] of messageText.entries()) {
                msgs[id] = chunks;
              }
              return JSON.stringify(msgs, null, 2);
            }
            case "state":
            default: {
              await log.stateDump("baba-goal-detect", {
                assessedCount: assessed.size,
                assessed: Array.from(assessed),
                messageTextCount: messageText.size,
                messageText: Object.fromEntries(messageText),
              });
              return "State dumped to debug outputs (console, file, client.app.log)";
            }
          }
        },
      }),
    },

    event: async ({ event }: { event: any }) => {
      if (event.type === "message.part.updated") {
        const part = event.properties?.part;
        await log.debug("message.part.updated", { 
          messageId: part?.messageID, 
          sessionId: part?.sessionID, 
          textLength: part?.text?.length ?? 0 
        });
        collectText(part);
        return;
      }

      if (event.type === "message.updated") {
        const info = event.properties?.info;
        if (!info || info.role !== "user" || typeof info.sessionID !== "string") return;
        if (assessed.has(info.sessionID)) return;

        await log.debug("message.updated - user message, deferring assessment", { 
          sessionId: info.sessionID, 
          messageId: info.id 
        });

        // message.updated can arrive before the message's parts, so defer to the
        // next tick and judge whatever text the bus accumulated by then.
        const sessionId = info.sessionID;
        setTimeout(async () => {
          if (assessed.has(sessionId)) return;
          assessed.add(sessionId);

          const chunks = messageText.get(info.id) ?? [];
          const text = chunks.join("\n").trim();
          if (text.length === 0) {
            await log.debug("no text accumulated for assessment", { sessionId, messageId: info.id });
            return;
          }

          const isGoal = isGoalLike(text);
          await log.debug("goal assessment complete", { 
            sessionId, 
            messageId: info.id, 
            textLength: text.length, 
            isGoal,
            textPreview: text.slice(0, 100) 
          });

          if (!isGoal) return;

          await log.info("goal detected, sending suggestion", { sessionId });
          void suggest(sessionId);
        }, 0);
        return;
      }

      if (event.type === "session.deleted") {
        const sessionId = sessionIdFromEvent(event.properties);
        if (sessionId) {
          await log.debug("session.deleted, cleaning up", { sessionId });
          assessed.delete(sessionId);
          messageText.delete(sessionId);
        }
      }
    },
  };
};