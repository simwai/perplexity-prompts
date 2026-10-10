/**
 * Session id extraction for opencode event payloads.
 *
 * The event bus is not uniform about where the session id lives:
 *
 *   - session.created, session.updated, session.deleted carry
 *     `properties.info` (a Session object), so the id is `properties.info.id`.
 *   - session.idle, session.compacted, session.status carry
 *     `properties.sessionID` directly.
 *
 * Plugins reading only `properties.sessionID` therefore resolve to undefined
 * for the first group and silently do nothing, which is the failure this
 * helper exists to remove. Verified against @opencode-ai/sdk 1.18.34
 * (EventSessionCreated, EventSessionUpdated, EventSessionDeleted,
 * EventSessionIdle, EventSessionCompacted in gen/types.gen.d.ts).
 *
 * Reads both shapes so a plugin is correct regardless of which event it
 * handles. This file lives in lib/ because opencode auto-loads every
 * top-level file in plugins/ as a plugin.
 */
export function sessionIdFromEvent(properties: unknown): string | undefined {
  if (typeof properties !== "object" || properties === null) return undefined;
  const props = properties as { sessionID?: unknown; info?: { id?: unknown } | unknown };

  if (typeof props.sessionID === "string" && props.sessionID.length > 0) {
    return props.sessionID;
  }
  const info = props.info;
  if (typeof info === "object" && info !== null) {
    const id = (info as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return undefined;
}

export default async () => ({});