import { describe, it } from "node:test";
import assert from "node:assert/strict";
import GoalDetectPlugin from "../baba-goal-detect.ts";

type Hooks = Awaited<ReturnType<typeof GoalDetectPlugin>>;

let counter = 0;
function freshIds(): { session: string; message: string } {
  counter += 1;
  return { session: `ses_goal_${counter}`, message: `msg_goal_${counter}` };
}

interface Harness {
  hooks: Hooks;
  prompts: Array<{ sessionId: unknown; noReply: unknown; text: string }>;
}

async function harness(): Promise<Harness> {
  const prompts: Array<{ sessionId: unknown; noReply: unknown; text: string }> = [];
  const hooks = await GoalDetectPlugin({
    client: {
      session: {
        prompt: async (opts: any) => {
          prompts.push({
            sessionId: opts?.path?.id,
            noReply: opts?.body?.noReply,
            text: opts?.body?.parts?.[0]?.text ?? "",
          });
          return { data: { info: {}, parts: [] } };
        },
      },
    },
    directory: process.cwd(),
    project: {},
    worktree: process.cwd(),
    $: undefined,
  } as never);
  return { hooks, prompts };
}

/** Deliver a user message the way the bus does: parts first, then info. */
async function deliver(
  hooks: Hooks,
  session: string,
  message: string,
  text: string,
): Promise<void> {
  await hooks.event?.({
    event: {
      type: "message.part.updated",
      properties: { part: { id: `prt_${message}`, messageID: message, sessionID: session, type: "text", text } },
    },
  } as never);
  await hooks.event?.({
    event: {
      type: "message.updated",
      properties: { info: { id: message, sessionID: session, role: "user" } },
    },
  } as never);
  // The handler defers judgement by one tick so parts can arrive first.
  await new Promise((resolve) => setTimeout(resolve, 5));
}

describe("baba-goal-detect", () => {
  it("suggests kickoff for a goal-like first message", async () => {
    const { hooks, prompts } = await harness();
    const { session, message } = freshIds();
    await deliver(
      hooks,
      session,
      message,
      "I want to build a small tool that reads my trading journal and flags bad entries",
    );
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0]?.sessionId, session);
    assert.equal(prompts[0]?.noReply, true, "the suggestion must not trigger an LLM turn");
    assert.match(prompts[0]?.text ?? "", /\/kickoff/);
  });

  it("stays silent for a concrete target", async () => {
    const { hooks, prompts } = await harness();
    const { session, message } = freshIds();
    await deliver(hooks, session, message, "Please fix the bug in src/parser.ts where parsing fails");
    assert.equal(prompts.length, 0);
  });

  it("stays silent for a slash command", async () => {
    const { hooks, prompts } = await harness();
    const { session, message } = freshIds();
    await deliver(hooks, session, message, "/kickoff build me a roadmap for the next quarter of work");
    assert.equal(prompts.length, 0);
  });

  it("stays silent for an exploratory question", async () => {
    const { hooks, prompts } = await harness();
    const { session, message } = freshIds();
    await deliver(hooks, session, message, "How does the loading order work across the prompt system files");
    assert.equal(prompts.length, 0);
  });

  it("assesses only the first user message", async () => {
    const { hooks, prompts } = await harness();
    const { session, message } = freshIds();
    await deliver(hooks, session, message, "build me a dashboard that shows all my open pull requests");
    assert.equal(prompts.length, 1);

    const second = freshIds();
    await deliver(
      hooks,
      session,
      second.message,
      "also create a report generator that summarises everything each morning",
    );
    assert.equal(prompts.length, 1, "a second goal-like message must not re-suggest");
  });

  it("ignores synthetic parts so one plugin cannot trigger another", async () => {
    const { hooks, prompts } = await harness();
    const { session, message } = freshIds();
    await hooks.event?.({
      event: {
        type: "message.part.updated",
        properties: {
          part: {
            id: `prt_${message}`,
            messageID: message,
            sessionID: session,
            type: "text",
            synthetic: true,
            text: "build me a tool that does something long enough to pass the heuristics",
          },
        },
      },
    } as never);
    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: { info: { id: message, sessionID: session, role: "user" } },
      },
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 5));

    assert.equal(prompts.length, 0);
  });

  it("re-arms after the session is deleted", async () => {
    const { hooks, prompts } = await harness();
    const { session, message } = freshIds();
    await deliver(hooks, session, message, "build me a dashboard that shows all my open pull requests");
    assert.equal(prompts.length, 1);

    await hooks.event?.({
      event: { type: "session.deleted", properties: { info: { id: session } } },
    } as never);

    const second = freshIds();
    await deliver(
      hooks,
      session,
      second.message,
      "write me a tool that generates weekly summaries of everything I worked on",
    );
    assert.equal(prompts.length, 2);
  });
});