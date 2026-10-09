import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getSessionUserText, pruneSession, recordMessageInfo, recordPart } from "./message-events.js";

function userTextPart(sessionID: string, messageID: string, text: string, extra: Record<string, unknown> = {}) {
  return { id: `part-${messageID}`, sessionID, messageID, type: "text", text, ...extra };
}

describe("message-events", () => {
  it("returns user-role text and skips assistant messages", () => {
    const session = "msg-events-s1";
    recordMessageInfo({ id: "m-assistant", sessionID: session, role: "assistant" });
    recordPart(userTextPart(session, "m-assistant", "Remember to handle errors gracefully"));
    recordMessageInfo({ id: "m-user", sessionID: session, role: "user" });
    recordPart(userTextPart(session, "m-user", "always use zod for validation"));
    assert.equal(getSessionUserText(session), "always use zod for validation");
    pruneSession(session);
  });

  it("resolves text recorded before the role arrives", () => {
    const session = "msg-events-s2";
    recordPart(userTextPart(session, "m-late-role", "avoid try/catch in handlers"));
    assert.equal(getSessionUserText(session), "");
    recordMessageInfo({ id: "m-late-role", sessionID: session, role: "user" });
    assert.equal(getSessionUserText(session), "avoid try/catch in handlers");
    pruneSession(session);
  });

  it("skips synthetic, ignored, empty, and non-text parts", () => {
    const session = "msg-events-s3";
    recordMessageInfo({ id: "m-skip", sessionID: session, role: "user" });
    recordPart(userTextPart(session, "m-skip", "injected digest text", { synthetic: true }));
    recordPart(userTextPart(session, "m-skip", "ignored fragment", { ignored: true }));
    recordPart(userTextPart(session, "m-skip", ""));
    recordPart({ id: "p-tool", sessionID: session, messageID: "m-skip", type: "tool" });
    assert.equal(getSessionUserText(session), "");
    recordPart(userTextPart(session, "m-skip", "real user words here"));
    assert.equal(getSessionUserText(session), "real user words here");
    pruneSession(session);
  });

  it("prefers the latest user message and prunes on session end", () => {
    const session = "msg-events-s4";
    recordMessageInfo({ id: "m-first", sessionID: session, role: "user" });
    recordPart(userTextPart(session, "m-first", "first directive here"));
    recordMessageInfo({ id: "m-second", sessionID: session, role: "user" });
    recordPart(userTextPart(session, "m-second", "second directive here"));
    assert.equal(getSessionUserText(session), "second directive here");
    pruneSession(session);
    assert.equal(getSessionUserText(session), "");
  });

  it("ignores unknown roles", () => {
    const session = "msg-events-s5";
    recordMessageInfo({ id: "m-weird", sessionID: session, role: "system" });
    recordPart(userTextPart(session, "m-weird", "system prompt content here"));
    assert.equal(getSessionUserText(session), "");
    pruneSession(session);
  });
});
