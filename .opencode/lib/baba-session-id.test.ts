import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sessionIdFromEvent } from "./baba-session-id";

/**
 * Shapes taken from @opencode-ai/sdk 1.18.34 gen/types.gen.d.ts. The two
 * groups are genuinely different, which is why a single read of
 * properties.sessionID silently disables every plugin keyed on session.created.
 */
describe("sessionIdFromEvent", () => {
  it("reads info.id for session.created, updated and deleted", () => {
    // EventSessionCreated / EventSessionUpdated / EventSessionDeleted all
    // declare `properties: { info: Session }`.
    for (const type of ["session.created", "session.updated", "session.deleted"]) {
      const id = sessionIdFromEvent({ info: { id: `ses_${type}`, title: "t" } });
      assert.equal(id, `ses_${type}`, `${type} must resolve via properties.info.id`);
    }
  });

  it("reads properties.sessionID for session.idle, compacted and status", () => {
    // EventSessionIdle declares `properties: { sessionID: string }`.
    assert.equal(sessionIdFromEvent({ sessionID: "ses_idle" }), "ses_idle");
  });

  it("prefers sessionID when both shapes are present", () => {
    assert.equal(
      sessionIdFromEvent({ sessionID: "ses_direct", info: { id: "ses_nested" } }),
      "ses_direct",
    );
  });

  it("returns undefined instead of a non-string", () => {
    assert.equal(sessionIdFromEvent(undefined), undefined);
    assert.equal(sessionIdFromEvent(null), undefined);
    assert.equal(sessionIdFromEvent({}), undefined);
    assert.equal(sessionIdFromEvent({ info: {} }), undefined);
    assert.equal(sessionIdFromEvent({ info: { id: 42 } }), undefined);
    assert.equal(sessionIdFromEvent({ sessionID: "" }), undefined);
  });

  it("rejects a payload shaped like the old bug", () => {
    // properties.sessionID is absent on the info-shaped events, so a plugin
    // reading only that field resolves to undefined and does nothing.
    const payload = { info: { id: "ses_real" } };
    assert.equal((payload as { sessionID?: string }).sessionID, undefined);
    assert.equal(sessionIdFromEvent(payload), "ses_real");
  });
});