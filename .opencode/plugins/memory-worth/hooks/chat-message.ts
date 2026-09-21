import { searchMemories } from "../db/queries.js";

export async function injectMemories(
  client: LibSQLClient,
  prompt: string,
  sessionId: string,
  maxMemories: number = 5
): Promise<string> {
  const memories = await searchMemories(client, prompt, maxMemories, undefined, sessionId);

  if (memories.length === 0) return prompt;

  const memoryBlock = memories
    .map((m, i) => `[MEMORY ${i + 1}] trust=${m.trust_label} score=${m.trust_score} evidence=${m.evidence_count}\n${m.content}`)
    .join("\n\n");

  return `${prompt}\n\n--- Relevant memories ---\n${memoryBlock}\n--- End memories ---`;
}
