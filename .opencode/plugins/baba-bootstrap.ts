/**
 * Auto-First-Message Plugin for opencode
 *
 * Delivers the session-start reminder exactly once per session, on the first
 * user message. Two delivery paths, tried in order:
 *
 *   1. session.prompt with noReply -- posts the reminder into the session
 *      without triggering an LLM turn. Preferred: it is a first-class SDK call
 *      and does not depend on hook ordering.
 *   2. chat.message part injection -- appends the reminder to the user's own
 *      first message when path 1 did not confirm. Used when the session is not
 *      ready yet at session.created, which is the common case.
 *
 * A session is marked delivered by whichever path succeeds first, so the
 * reminder can never appear twice.
 *
 * Enforcement is NOT this plugin's job. baba-prompt-system-loader already
 * holds assistant output until the required prompt-system files are read.
 */

import { sessionIdFromEvent } from "../lib/baba-session-id";

/**
 * opencode validates part and message ids against a prefix schema before
 * persisting them: part ids must start with `prt`, message ids with `msg`. An
 * id without the prefix is rejected and the part is dropped, which is silent
 * from the user's side. Ids derive from the message id, which opencode
 * guarantees is unique per turn.
 */
function partId(messageId: string, label: string): string {
  return `prt_${label}_${messageId}`;
}

function fallbackMessageId(sessionId: string): string {
  return `msg_baba_bootstrap_${sessionId}`;
}

const FIRST_MESSAGE = `# Session Start Reminder

Before you do anything else, you MUST:

1. **Read AGENTS.md in full** -- This is the sole entry point for the Baba prompt system
2. **Follow all instructions 1:1** -- No deviations, no shortcuts

The system will not function correctly if you skip this step. The STARTUP phase in 00-system.md requires you to:
- Read prompt-system/00-system.md in full (no chunking)
- Load every file in the load order in full (no chunking)
- Record completion in session context

Do not respond to the user or take any action until this is complete.`;

/** Sessions that already carry the reminder, whichever path delivered it. */
const delivered = new Set<string>();

export default async ({ client, $, project, directory, worktree }: {
  client: any;
  $: any;
  project: any;
  directory: string;
  worktree: string;
}) => {
  async function deliverViaSessionPrompt(sessionId: string): Promise<boolean> {
    try {
      await client.session.prompt({
        path: { id: sessionId },
        body: {
          noReply: true,
          parts: [{ type: "text", text: FIRST_MESSAGE }],
        },
      });
      return true;
    } catch {
      // Session not ready yet, or the endpoint is unavailable. The chat.message
      // hook below covers this case.
      return false;
    }
  }

  return {
    event: async ({ event }: { event: any }) => {
      if (event.type === "session.created") {
        const sessionId = sessionIdFromEvent(event.properties);
        if (!sessionId) return;
        delivered.delete(sessionId);
        if (await deliverViaSessionPrompt(sessionId)) {
          delivered.add(sessionId);
        }
        return;
      }

      if (event.type === "session.deleted") {
        const sessionId = sessionIdFromEvent(event.properties);
        if (sessionId) delivered.delete(sessionId);
        return;
      }
    },

    "chat.message": async (
      input: { sessionID?: string; messageID?: string },
      output: { message: any; parts: any[] },
    ) => {
      const sessionId = input.sessionID;
      if (!sessionId) return;
      if (delivered.has(sessionId)) return;

      delivered.add(sessionId);
      const messageId = input.messageID ?? fallbackMessageId(sessionId);
      output.parts.push({
        id: partId(messageId, "bootstrap"),
        sessionID: sessionId,
        messageID: messageId,
        type: "text",
        text: FIRST_MESSAGE,
      });
    },
  };
};