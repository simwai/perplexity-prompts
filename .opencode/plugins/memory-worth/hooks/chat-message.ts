import type { Client } from "@libsql/client";
import { asText } from "../db/decode.js";
import { getStatsFull, searchMemoriesFts } from "../db/queries.js";

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
 * Build the once-per-session memory digest injected into the conversation.
 *
 * The query comes from the user's own message. An earlier version searched the
 * literal string "memory", which against `content LIKE '%memory%'` matched
 * almost nothing -- the digest reported near-zero hits on every session while
 * looking like it had run. Retrieval now goes through searchMemoriesFts, which
 * queries the memory_fts_v2 index with bm25 ranking instead of scanning with
 * LIKE.
 */
export async function buildInjectionTexts(
  db: Client,
  sessionId: string,
  isFirst: boolean,
  userText = "",
): Promise<string[]> {
  if (!isFirst) return [];

  const stats = await getStatsFull(db);
  const lines: string[] = [];
  lines.push(
    `memory-worth session digest: ${stats.total} memories, ${stats.unresolved_episodes} unresolved episodes.`,
  );

  const ftsQuery = buildFtsQuery(userText);
  if (!ftsQuery) return lines;

  let hits;
  try {
    hits = await searchMemoriesFts(db, ftsQuery, { limit: 5 });
  } catch (err) {
    // A malformed MATCH must not break the session; the stats line still stands.
    lines.push(`(memory retrieval skipped: ${(err as Error).message.slice(0, 120)})`);
    return lines;
  }

  if (hits.length === 0) {
    lines.push(`No stored memory matched this request (query: ${ftsQuery}).`);
    return lines;
  }

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
      `memory ${hit.id} (mw ${Math.round(hit.mw * 100) / 100}, ` +
        `uses ${hit.usage_count}, task ${hit.task_type}${tagsText}): ` +
        `${hit.content.slice(0, 200)}`,
    );
  }
  return lines;
}
