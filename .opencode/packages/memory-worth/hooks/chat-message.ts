import type { Client } from "@libsql/client";
import { asNumber, asText } from "../db/decode.js";
import { getParameter, getStatsFull, searchMemoriesFts, writeMemoryFull, findDuplicateFull } from "../db/queries.js";
import { quantileLabel } from "../core/trust.js";

/**
 * Prefix every line the plugin pushes into the chat so the user can tell
 * memory activity apart from the conversation. These parts render in the
 * transcript, which is the only user-facing surface a plugin hook has.
 */
const TAG = "[MEMORY]";

/** Counts per trust label for the active population. */
type TrustBreakdown = { high: number; neutral: number; low: number; unproven: number };

/**
 * Trust distribution over active memories.
 *
 * labelMemory() re-queries the whole active population on every call, so
 * calling it per row would issue one population query per memory. The
 * quantiles are resolved once here and applied to every row instead, which is
 * what labelMemory() would have computed with the same inputs.
 */
async function getTrustBreakdown(db: Client): Promise<TrustBreakdown> {
  const breakdown: TrustBreakdown = { high: 0, neutral: 0, low: 0, unproven: 0 };
  const rows = await db.execute({
    sql: `SELECT m.mw AS mw, m.s_plus AS s_plus, m.s_minus AS s_minus FROM memory m JOIN memory_status ms ON m.status_id = ms.id WHERE ms.name = 'active'`,
    args: [],
  });
  if (rows.rows.length === 0) return breakdown;

  const population = rows.rows.map((row) => asNumber(row["mw"]));
  const trustRaw = Number(await getParameter(db, "trust_q", "0.70"));
  const doubtRaw = Number(await getParameter(db, "doubt_q", "0.30"));
  const evidenceRaw = Number(await getParameter(db, "min_evidence", "3"));
  const trustQ = Number.isFinite(trustRaw) ? trustRaw : 0.7;
  const doubtQ = Number.isFinite(doubtRaw) ? doubtRaw : 0.3;
  const minEvidence = Number.isFinite(evidenceRaw) ? evidenceRaw : 3;

  for (const row of rows.rows) {
    const evidence = asNumber(row["s_plus"]) + asNumber(row["s_minus"]);
    const label = evidence < minEvidence ? "unproven" : quantileLabel(asNumber(row["mw"]), population, trustQ, doubtQ);
    breakdown[label] += 1;
  }
  return breakdown;
}

/** Render only the non-empty trust buckets, so an all-unproven store stays short. */
function formatTrustBreakdown(byTrust: TrustBreakdown): string {
  const parts: string[] = [];
  if (byTrust.high > 0) parts.push(`${byTrust.high} high-trust`);
  if (byTrust.neutral > 0) parts.push(`${byTrust.neutral} neutral`);
  if (byTrust.low > 0) parts.push(`${byTrust.low} low-trust`);
  if (byTrust.unproven > 0) parts.push(`${byTrust.unproven} unproven`);
  return parts.length > 0 ? parts.join(", ") : "none labelled";
}

/**
 * Words too common to discriminate between memories. Without this the
 * digest spends its token budget on the user's filler words.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "you", "are", "but", "not", "with", "this", "that",
  "from", "have", "has", "was", "were", "will", "would", "can", "could",
  "should", "your", "our", "its", "it's", "into", "out", "get", "got",
  "let", "lets", "please", "thanks", "thank", "here", "there", "what",
  "when", "where", "which", "who", "whom", "how", "why", "all", "any",
  "some", "such", "only", "own", "same", "too", "very", "just", "now",
  "then", "than", "about", "after", "before", "does", "did", "doing",
]);

/**
 * Build a safe FTS5 MATCH expression from free text.
 *
 * Two hazards this avoids. First, FTS5 treats - " ( ) * : and the boolean
 * operators as syntax, so raw user text throws. Second, an unqualified OR of
 * every token ranks documents matching the most tokens first, which is what we
 * want, but stopwords drag in noise. Tokens are therefore reduced to
 * identifier-ish characters and each is quoted as its own phrase.
 */
export function buildFtsQuery(text: string, maxTokens = 8): string | null {
  const tokens = text
    .replace(/[^A-Za-z0-9_.]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[._]+|[._]+$/g, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t.toLowerCase()));

  const unique = [...new Set(tokens)].slice(0, maxTokens);
  if (unique.length === 0) return null;

  return unique.map((t) => `"${t}"`).join(" OR ");
}

/**
 * Capture markers — phrases that indicate a user wants to store a durable rule.
 * Based on DESIGN_MEMORY_CAPTURE.md classification.
 */
const CAPTURE_MARKERS = {
  prohibition: ["don't", "do not", "avoid", "stop", "never", "no longer"],
  mandate: ["always", "must", "make sure", "from now on", "going forward"],
  correction: ["instead", "rather than", "not", "but", "that's wrong"],
  explicit: ["remember that", "note that", "i told you", "save that", "save this", "save to memory", "remember to", "remember:"],
} as const;

/**
 * Phrases that indicate a one-shot task (not a generalizable rule).
 * These should NOT trigger capture.
 */
const ONESHOT_MARKERS = [
  "right now",
  "just now",
  "this once",
  "for now",
  "temporarily",
  "quickly",
  "asap",
  "run that",
  "execute that",
  "do that",
] as const;

/**
 * Check if text contains a capture marker and generalizes to a practice/convention.
 * Returns the extracted normative clause if it should be captured, null otherwise.
 */
function extractCaptureClause(text: string): string | null {
  const lower = text.toLowerCase();

  // Check for one-shot markers first — these override capture markers
  for (const marker of ONESHOT_MARKERS) {
    if (lower.includes(marker)) return null;
  }

  // Check for capture markers
  let foundMarker = false;
  for (const category of Object.values(CAPTURE_MARKERS)) {
    for (const marker of category) {
      if (lower.includes(marker)) {
        foundMarker = true;
        break;
      }
    }
    if (foundMarker) break;
  }

  if (!foundMarker) return null;

  // Explicit save instructions ("save that to memory", "remember to X")
  // refer to content BEFORE the marker — strip the instruction, keep the rest
  const saveInstructions = ["save that to memory", "save this to memory", "save that", "save this"];
  for (const instr of saveInstructions) {
    const idx = lower.indexOf(instr);
    if (idx >= 0) {
      const before = text.slice(0, idx).trim().replace(/[,.]+$/, "");
      if (before.length >= 10 && before.split(/\s+/).length >= 3) {
        return before;
      }
      // If nothing meaningful before, fall through to default extraction
      break;
    }
  }

  // Extract the normative clause — everything after the marker
  // This is a simplified extraction; could be improved with NLP
  let clause = text.trim();

  // Try to find the marker position and extract what follows
  for (const category of Object.values(CAPTURE_MARKERS)) {
    for (const marker of category) {
      const idx = lower.indexOf(marker);
      if (idx >= 0) {
        // Extract from marker onwards, but include some context before
        const start = Math.max(0, idx - 20);
        clause = text.slice(start).trim();
        break;
      }
    }
    if (clause !== text.trim()) break;
  }

  // Basic quality gate: clause should be substantial enough to be a rule
  if (clause.length < 10 || clause.split(/\s+/).length < 3) return null;

  return clause;
}

/**
 * Derive applies_when scope from the user's message.
 * Looks for file/symbol references, topic keywords, or defaults to general.
 */
function deriveAppliesWhen(text: string): string {
  const lower = text.toLowerCase();

  // Explicit file/symbol mentions
  const fileMatch = text.match(/(?:in|at|file|path)\s+([\w/.-]+\.\w+)/i);
  if (fileMatch) return `working in ${fileMatch[1]}`;

  const symbolMatch = text.match(/(?:function|method|class|variable|symbol)\s+(\w+)/i);
  if (symbolMatch) return `working with ${symbolMatch[1]}`;

  // Topic keywords — matched on word boundaries to avoid false positives
  // (e.g. "rest of the" must not match the REST API topic)
  const topics: Record<string, RegExp[]> = {
    "error handling": [/\berror\b/, /\bexception\b/, /\btry\b/, /\bcatch\b/, /\bthrow\b/],
    "validation": [/\bvalidat\w*\b/, /\bschema\b/, /\bzod\b/, /\binput\b/, /\bsanitiz\w*\b/],
    "dependencies": [/\bdependenc\w*\b/, /\bimport\b/, /\bpackage\b/, /\bnpm\b/, /\bpnpm\b/, /\byarn\b/, /\bpdm\b/, /\bvenv\b/],
    "testing": [/\btest\b/, /\bspec\b/, /\bmock\b/, /\bfixture\b/, /\bcoverage\b/],
    "git": [/\bgit\b/, /\bcommit\b/, /\bpush\b/, /\bbranch\b/, /\bmerge\b/, /\brebase\b/],
    "database": [/\bdatabase\b/, /\bsql\b/, /\bquery\b/, /\bmigration\b/, /\bschema\b/],
    "api": [/\bapi\b/, /\bendpoint\b/, /\broute\b/, /\bhttp\b/, /\brest\b(?! of\b|\s+of\b)/, /\bgraphql\b/],
    "typescript": [/\btypescript\b/, /\btsconfig\b/, /\binterface\b/, /\bgeneric\b/],
    "python": [/\bpython\b/, /\bpyproject\b/, /\bpip\b/, /\bpoetry\b/, /\bpdm\b/, /\bvenv\b/],
    "documentation": [/\breadme\b/, /\bmarkdown\b/, /\bdocs\b/, /\bdocumentation\b/, /\bsvg\b/, /\bbanner\b/],
  };

  for (const [topic, patterns] of Object.entries(topics)) {
    if (patterns.some(p => p.test(lower))) {
      return topic;
    }
  }

  return "always in this project";
}

/**
 * Detect capture intent and write memory if appropriate.
 * Returns confirmation text if captured, null otherwise.
 */
export async function detectAndCaptureMemory(
  db: Client,
  sessionId: string,
  userText: string,
): Promise<string | null> {
  const clause = extractCaptureClause(userText);
  if (!clause) return null;

  const appliesWhen = deriveAppliesWhen(userText);

  // Check for exact duplicate
  const duplicate = await findDuplicateFull(db, clause);
  if (duplicate !== null) {
    return `${TAG} Memory #${duplicate} already says this — nothing new stored. Say "forget that rule" to retire it.`;
  }

  // Extract grounds (file/symbol mentions)
  const grounds: Array<{ kind: string; value: string }> = [];
  const fileMatches = userText.match(/[\w/.-]+\.\w+/g);
  if (fileMatches) {
    for (const file of fileMatches) {
      grounds.push({ kind: "file", value: file });
    }
  }

  try {
    const stored = await writeMemoryFull(db, {
      content: clause,
      applies_when: appliesWhen,
      tags: [],
      grounds,
      taskType: "general",
      memoryType: "convention",
      tier: "L2", // Single sighting = L2, promoted to L1 on restatement
      source: "user",
      project: "default",
      topic: undefined,
      confidence: 50,
    });

    return (
      `${TAG} Captured as memory #${stored.id} (tier L2, unproven).\n` +
      `${TAG}   rule: "${clause.slice(0, 100)}"\n` +
      `${TAG}   applies when: ${appliesWhen}\n` +
      `${TAG}   trust rises when it is used and helps; say "forget that rule" to retire it.`
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "capture failed";
    return `${TAG} Capture failed: ${message}`;
  }
}

/**
 * Per-session emission state.
 *
 * `emitted` guards the turn: chat.message carries a messageID that is stable
 * for one user turn, so a second injection attempt for the same message is a
 * no-op regardless of how many paths try. `lastHits` is the previous retrieval
 * result set, used to avoid re-printing an identical memory list on the next
 * message of the same session.
 */
type SessionState = { emitted: Set<string>; lastHits: string };
const sessionState = new Map<string, SessionState>();

function stateFor(sessionId: string): SessionState {
  const existing = sessionState.get(sessionId);
  if (existing) return existing;
  const created: SessionState = { emitted: new Set(), lastHits: "" };
  sessionState.set(sessionId, created);
  return created;
}

/**
 * Build the memory feedback injected into the conversation.
 *
 * The query comes from the user's own message. An earlier version searched the
 * literal string "memory", which against `content LIKE '%memory%'` matched
 * almost nothing -- the digest reported near-zero hits on every session while
 * looking like it had run. Retrieval now goes through searchMemoriesFts, which
 * queries the memory_fts_v2 index with bm25 ranking instead of scanning with
 * LIKE.
 *
 * The session summary is once per session; retrieval runs on every message but
 * is suppressed when the hit set is unchanged from the previous one, so a
 * follow-up message about the same topic does not re-print the same memories.
 *
 * Idempotent per turn: `messageId` is the emission guard. opencode dispatches
 * chat.message before messages.transform and before the LLM loop, and passes
 * output.parts by reference (session/prompt.ts), then persists every part
 * (sessions.updatePart), so anything pushed here is rendered. The guard means
 * adding a second delivery path later cannot double-inject the same turn.
 */
export async function buildInjectionTexts(
  db: Client,
  sessionId: string,
  isFirst: boolean,
  userText = "",
  messageId?: string,
): Promise<string[]> {
  const state = stateFor(sessionId);
  if (messageId !== undefined) {
    if (state.emitted.has(messageId)) return [];
    state.emitted.add(messageId);
  }

  const lines: string[] = [];

  if (isFirst) {
    const stats = await getStatsFull(db);
    const byTrust = await getTrustBreakdown(db);
    const retired = Object.entries(stats.by_status)
      .filter(([status]) => status !== "active")
      .map(([status, count]) => `${count} ${status}`);
    const tail = retired.length > 0 ? `, ${retired.join(", ")}` : "";
    lines.push(
      `${TAG} Session start — ${stats.total} memories (${formatTrustBreakdown(byTrust)}${tail}), ` +
        `${stats.unresolved_episodes} unresolved episodes.`,
    );
  }

  const ftsQuery = buildFtsQuery(userText);
  if (!ftsQuery) return lines;

  let hits;
  try {
    hits = await searchMemoriesFts(db, ftsQuery, { limit: 5 });
  } catch (err) {
    // A malformed MATCH must not break the session; the summary line still stands.
    lines.push(`${TAG} Retrieval skipped: ${(err as Error).message.slice(0, 120)}`);
    return lines;
  }

  const hitKey = hits.map((hit) => hit.id).join(",");
  if (hitKey === state.lastHits) return lines;
  state.lastHits = hitKey;

  if (hits.length === 0) {
    lines.push(`${TAG} No stored memory matched this request.`);
    return lines;
  }

  lines.push(`${TAG} Retrieved ${hits.length} ${hits.length === 1 ? "memory" : "memories"} for this request:`);
  for (const hit of hits) {
    const tags = await db.execute({
      sql: `SELECT t.name AS name FROM tag t JOIN memory_tag mt ON t.id = mt.tag_id WHERE mt.memory_id = ? ORDER BY t.name LIMIT 3`,
      args: [hit.id],
    });
    const names: string[] = [];
    for (const row of tags.rows) {
      names.push(asText(row["name"]));
    }
    const tagsText = names.length > 0 ? `, tags: ${names.join(",")}` : "";
    lines.push(
      `${TAG} #${hit.id} (trust ${Math.round(hit.mw * 100) / 100}, used ${hit.usage_count}x, ` +
        `task ${hit.task_type}${tagsText}): ${hit.content.slice(0, 200)}`,
    );
  }
  return lines;
}

/** Drop the emission state when a session ends. */
export function forgetInjectionState(sessionId: string): void {
  sessionState.delete(sessionId);
}
