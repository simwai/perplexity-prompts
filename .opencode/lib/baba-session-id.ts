/**
 * Session id extraction for opencode event payloads.
 *
 * V1 and V2 disagree about both the envelope field and where the id lives:
 *
 *   V1: `event.properties.sessionID`, or `event.properties.info.id` for
 *       session.created/updated/deleted (which carry a Session object).
 *   V2: `event.data.sessionID` for every session event, on an envelope that
 *       also carries `id`, `created`, `type`, `location`, and `metadata`.
 *
 * A plugin reading only `properties.sessionID` resolves to undefined under V2
 * and silently does nothing. This helper reads the V2 shape first and falls
 * back to the V1 shape, so one implementation is correct on both.
 */

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function sessionIdFromEvent(properties: unknown): string | undefined {
  if (typeof properties !== "object" || properties === null) return undefined;

  const envelope = properties as Record<string, unknown>;

  // V2: the payload moved from `properties` to `data`.
  const data = envelope.data;
  if (typeof data === "object" && data !== null) {
    const direct = readString((data as Record<string, unknown>).sessionID);
    if (direct) return direct;
    // Some V2 events keep a nested session object.
    const info = (data as Record<string, unknown>).info;
    if (typeof info === "object" && info !== null) {
      const nested = readString((info as Record<string, unknown>).id);
      if (nested) return nested;
    }
  }

  // V1: direct on properties, or on properties.info for the Session-valued events.
  const directV1 = readString(envelope.sessionID);
  if (directV1) return directV1;
  const infoV1 = envelope.info;
  if (typeof infoV1 === "object" && infoV1 !== null) {
    return readString((infoV1 as Record<string, unknown>).id);
  }

  return undefined;
}

export default async () => ({});

/**
 * V2 event subscription helper.
 *
 * `ctx.event.subscribe()` returns an async iterable rather than taking a
 * callback, so every V2 plugin needs the same consume loop. This wires it up,
 * dispatches each event by type, and returns a stop function for `setup`'s
 * cleanup. Errors are swallowed: a disposed stream closing mid-iteration is
 * expected on unload, not a failure worth surfacing.
 */
export async function subscribeToEvents(
  stream: AsyncIterable<unknown>,
  handler: (event: { type?: string } & Record<string, unknown>) => Promise<void> | void,
): Promise<() => void> {
  let stopped = false;

  void (async () => {
    try {
      for await (const raw of stream) {
        if (stopped) return;
        if (typeof raw !== "object" || raw === null) continue;
        const event = raw as { type?: string } & Record<string, unknown>;
        if (typeof event.type === "string") await handler(event);
      }
    } catch {
      // Stream disposed on unload, or the connection dropped.
    }
  })();

  return () => {
    stopped = true;
  };
}