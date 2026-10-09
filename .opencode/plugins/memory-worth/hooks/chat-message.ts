import type { Client } from "@libsql/client";
import { asText } from "../db/decode.js";
import { getStatsFull, searchMemoriesFts, writeMemoryFull, findDuplicateFull } from "../db/queries.js";
import { epochInt } from "../db/epoch.js";

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
  explicit: ["remember that", "note that", "i told you"],
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

  // Topic keywords
  const topics: Record<string, string[]> = {
    "error handling": ["error", "exception", "try", "catch", "throw", "handle"],
    "validation": ["validat", "schema", "zod", "input", "sanitiz"],
    "dependencies": ["dependenc", "import", "package", "npm", "pnpm", "yarn", "pdm", "venv"],
    "testing": ["test", "spec", "mock", "fixture", "coverage"],
    "git": ["git", "commit", "push", "branch", "merge", "rebase"],
    "database": ["database", "sql", "query", "migration", "schema"],
    "api": ["api", "endpoint", "route", "http", "rest", "graphql"],
    "typescript": ["typescript", "tsconfig", "type", "interface", "generic"],
    "python": ["python", "pyproject", "pip", "poetry", "pdm", "venv"],
  };

  for (const [topic, keywords] of Object.entries(topics)) {
    if (keywords.some(k => lower.includes(k))) {
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
    return `memory ${duplicate} already exists: "${clause.slice(0, 80)}..."`;
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

    return `captured as a durable rule: "${clause.slice(0, 100)}"\n  applies when: ${appliesWhen}\n  say "forget that rule" to remove it`;
  } catch (e) {
    const message = e instanceof Error ? e.message : "capture failed";
    return `(memory capture failed: ${message})`;
  }
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
