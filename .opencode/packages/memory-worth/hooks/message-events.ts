// User-text accumulation from the opencode event bus.
//
// Why this exists instead of reading output.parts in the chat.message hook:
// upstream anomalyco/opencode#22831 proves the runtime always delivers an
// empty parts array to that hook, so capture and FTS retrieval silently
// no-op live. Bus events carry the actual content: message.updated reports
// the message role, message.part.updated carries full text parts.
type Role = "user" | "assistant";

interface MessageInfo {
  id: string;
  sessionID: string;
  role: string;
}

interface TextPartShape {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  synthetic?: boolean;
  ignored?: boolean;
}

const roles = new Map<string, Role>();
const texts = new Map<string, string[]>();
const sessionMessages = new Map<string, string[]>();

const MAX_MESSAGES_PER_SESSION = 50;

function trackMessage(sessionID: string, messageID: string): void {
  const list = sessionMessages.get(sessionID) ?? [];
  if (!list.includes(messageID)) {
    list.push(messageID);
    sessionMessages.set(sessionID, list.slice(-MAX_MESSAGES_PER_SESSION));
  }
}

export function recordMessageInfo(info: MessageInfo): void {
  if (info.role !== "user" && info.role !== "assistant") return;
  roles.set(info.id, info.role);
  trackMessage(info.sessionID, info.id);
}

export function recordPart(part: TextPartShape): void {
  if (part.type !== "text") return;
  if (part.synthetic === true || part.ignored === true) return;
  const text = part.text ?? "";
  if (!text) return;
  const chunks = texts.get(part.messageID) ?? [];
  chunks.push(text);
  texts.set(part.messageID, chunks);
  trackMessage(part.sessionID, part.messageID);
}

export function getSessionUserText(sessionID: string): string {
  const list = sessionMessages.get(sessionID) ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const messageID = list[i] as string;
    if (roles.get(messageID) !== "user") continue;
    const chunks = texts.get(messageID) ?? [];
    if (chunks.length > 0) return chunks.join("\n");
  }
  return "";
}

export function pruneSession(sessionID: string): void {
  const list = sessionMessages.get(sessionID) ?? [];
  for (const messageID of list) {
    roles.delete(messageID);
    texts.delete(messageID);
  }
  sessionMessages.delete(sessionID);
}
