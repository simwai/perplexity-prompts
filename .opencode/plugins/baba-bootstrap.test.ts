import { describe, it } from "node:test";
import assert from "node:assert/strict";
import BootstrapPlugin from "./baba-bootstrap.js";

type Hooks = Awaited<ReturnType<typeof BootstrapPlugin>>;

const REMINDER_MARKER = "Session Start Reminder";

/** Session ids are module-global state, so every case gets a fresh one. */
let counter = 0;
function freshSession(): string {
  counter += 1;
  return `ses_boot_${counter}`;
}

interface Harness {
  hooks: Hooks;
  promptCalls: Array<{ sessionId: string; noReply: boolean | undefined }>;
}

/**
 * promptResult decides whether session.prompt resolves or throws, which is how
 * the preferred path is forced to fail and the fallback exercised.
 */
async function harness(promptResult: "ok" | "throw"): Promise<Harness> {
  const promptCalls: Array<{ sessionId: string; noReply: boolean | undefined }> = [];
  const hooks = await BootstrapPlugin({
    client: {
      session: {
        prompt: async (opts: any) => {
          promptCalls.push({
            sessionId: opts?.path?.id,
            noReply: opts?.body?.noReply,
          });
          if (promptResult === "throw") throw new Error("session not ready");
          return { data: true };
        },
      },
    },
    directory: process.cwd(),
    project: {},
    worktree: process.cwd(),
    $: undefined,
  } as never);
  return { hooks, promptCalls };
}

async function firstMessage(hooks: Hooks, sessionId: string, messageId: string) {
  const output = { message: {}, parts: [] as Array<{ id: string; messageID: string; text: string }> };
  await hooks["chat.message"]?.({ sessionID: sessionId, messageID: messageId }, output as never);
  return output;
}

describe("baba-bootstrap", () => {
  it("prefers session.prompt with noReply and does not also inject", async () => {
    const { hooks, promptCalls } = await harness("ok");
    const session = freshSession();

    await hooks.event?.({
      event: { type: "session.created", properties: { sessionID: session } },
    } as never);

    assert.equal(promptCalls.length, 1);
    assert.equal(promptCalls[0]?.sessionId, session);
    assert.equal(
      promptCalls[0]?.noReply,
      true,
      "the reminder must not trigger an LLM turn of its own",
    );

    const output = await firstMessage(hooks, session, "msg_boot_prefer");
    assert.equal(output.parts.length, 0, "no duplicate part after the prompt path won");
  });

  it("falls back to chat.message injection when session.prompt fails", async () => {
    const { hooks, promptCalls } = await harness("throw");
    const session = freshSession();

    await hooks.event?.({
      event: { type: "session.created", properties: { sessionID: session } },
    } as never);
    assert.equal(promptCalls.length, 1);

    const output = await firstMessage(hooks, session, "msg_boot_fallback");
    assert.equal(output.parts.length, 1);
    assert.match(output.parts[0]?.text ?? "", new RegExp(REMINDER_MARKER));
  });

  it("prefixes injected ids so opencode accepts the part", async () => {
    // opencode drops a part whose id lacks the prt prefix, which would make the
    // reminder vanish without an error.
    const { hooks } = await harness("throw");
    const session = freshSession();
    await hooks.event?.({
      event: { type: "session.created", properties: { sessionID: session } },
    } as never);

    const output = await firstMessage(hooks, session, "msg_boot_prefix");
    for (const part of output.parts) {
      assert.match(part.id, /^prt_/, `part id must start with prt: ${part.id}`);
      assert.match(part.messageID, /^msg_/, `message id must start with msg: ${part.messageID}`);
    }
  });

  it("reads the session id off the info-shaped session.created payload", async () => {
    // session.created carries properties.info, not properties.sessionID. Reading
    // only the latter resolves to undefined and the reminder never fires.
    const { hooks, promptCalls } = await harness("ok");
    const session = freshSession();

    await hooks.event?.({
      event: { type: "session.created", properties: { info: { id: session } } },
    } as never);

    assert.equal(promptCalls.length, 1);
    assert.equal(promptCalls[0]?.sessionId, session);
  });

  it("injects exactly once per session", async () => {
    const { hooks } = await harness("throw");
    const session = freshSession();
    await hooks.event?.({
      event: { type: "session.created", properties: { sessionID: session } },
    } as never);

    const first = await firstMessage(hooks, session, "msg_boot_once_1");
    const second = await firstMessage(hooks, session, "msg_boot_once_2");
    const third = await firstMessage(hooks, session, "msg_boot_once_3");

    assert.equal(first.parts.length, 1);
    assert.equal(second.parts.length, 0);
    assert.equal(third.parts.length, 0);
  });

  it("re-arms after the session is deleted", async () => {
    const { hooks } = await harness("throw");
    const session = freshSession();
    await hooks.event?.({
      event: { type: "session.created", properties: { sessionID: session } },
    } as never);
    assert.equal((await firstMessage(hooks, session, "msg_boot_rearm_1")).parts.length, 1);

    await hooks.event?.({
      event: { type: "session.deleted", properties: { sessionID: session } },
    } as never);

    // A deleted session is not expected to receive more messages, so this only
    // asserts the guard was released rather than that a message is delivered.
    assert.equal((await firstMessage(hooks, session, "msg_boot_rearm_2")).parts.length, 1);
  });
});