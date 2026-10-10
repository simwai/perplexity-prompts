import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import LoaderPlugin from "./baba-prompt-system-loader";

type Hooks = Awaited<ReturnType<typeof LoaderPlugin>>;

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "mw-loader-"));
  mkdirSync(join(dir, "prompt-system"), { recursive: true });
  mkdirSync(join(dir, "prompt-system", "stacks"), { recursive: true });
  writeFileSync(join(dir, "prompt-system", "00-system.md"), "root");
  writeFileSync(join(dir, "prompt-system", "05-impl-style.md"), "style");
  writeFileSync(join(dir, "prompt-system", "stacks", "STACK-typescript.md"), "stack");
  writeFileSync(join(dir, "prompt-system", "notes.txt"), "ignored");
  return dir;
}

async function harness(dir: string): Promise<Hooks> {
  return await LoaderPlugin({
    client: {
      find: {
        // The old discovery path. If this is ever called again the test fails,
        // because the SDK defines no `type` field on the query object.
        files: async () => {
          throw new Error("client.find.files must not be used for discovery");
        },
      },
    },
    directory: dir,
    project: {},
    worktree: dir,
    $: undefined,
  } as never);
}

/** Deliver a phase marker the way chat.messages.transform receives it. */
async function atPhase(hooks: Hooks, session: string, phase: string) {
  const output = {
    messages: [
      {
        info: { sessionID: session, metadata: {} },
        role: "assistant",
        parts: [{ type: "text", text: `[PHASE: ${phase}]\n\nbody` }],
      },
    ],
  };
  await hooks["experimental.chat.messages.transform"]?.({}, output as never);
  return output.messages[0]?.parts?.[0]?.text ?? "";
}

describe("baba-prompt-system-loader", () => {
  it("discovers prompt-system files from disk, not from client.find.files", async () => {
    const dir = fixture();
    try {
      const hooks = await harness(dir);
      // The real payload shape for session.created carries info, not sessionID.
      await hooks.event?.({
        event: { type: "session.created", properties: { info: { id: "ses_disc" } } },
      } as never);

      const blocked = await atPhase(hooks, "ses_disc", "PLAN");
      assert.match(blocked, /PROMPT SYSTEM LOADER/, "the gate must engage");

      // Top-level .md files are required; nested and non-md files are not.
      assert.match(blocked, /prompt-system\/00-system\.md/);
      assert.doesNotMatch(blocked, /notes\.txt/);
      assert.doesNotMatch(blocked, /STACK-typescript\.md/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("forces a re-read at PLAN v2, then stops blocking once files are read", async () => {
    const dir = fixture();
    try {
      const hooks = await harness(dir);
      await hooks.event?.({
        event: { type: "session.created", properties: { info: { id: "ses_read" } } },
      } as never);

      // Entering PLAN bumps v1 to v2 and deliberately clears the read record,
      // so the full set is re-read after the plan is approved. Reads made before
      // PLAN do not satisfy the v2 gate.
      const firstPlan = await atPhase(hooks, "ses_read", "PLAN");
      assert.match(firstPlan, /PROMPT SYSTEM LOADER/, "PLAN v2 forces a fresh read");

      for (const name of ["00-system.md", "05-impl-style.md"]) {
        await hooks["tool.execute.after"]?.({
          tool: "read",
          sessionID: "ses_read",
          callID: `c-${name}`,
          args: { filePath: join(dir, "prompt-system", name) },
        });
      }

      const afterReads = await atPhase(hooks, "ses_read", "PATCH");
      assert.doesNotMatch(afterReads, /PROMPT SYSTEM LOADER/, "reads satisfy the gate");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads the session id off the info-shaped payload", async () => {
    const dir = fixture();
    try {
      const hooks = await harness(dir);
      await hooks.event?.({
        event: { type: "session.created", properties: { info: { id: "ses_shape" } } },
      } as never);

      // A payload without info carries no id, so nothing is tracked and the
      // gate stays silent rather than blocking the wrong session.
      const blocked = await atPhase(hooks, "ses_shape", "PLAN");
      assert.match(blocked, /PROMPT SYSTEM LOADER/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});