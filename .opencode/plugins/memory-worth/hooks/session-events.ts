import { getTuningParams, getMemory } from "../db/queries.js";
import { recordOutcome, detectOutcome } from "./tool-execute-after.js";

export async function handleSessionCreated(client: LibSQLClient): Promise<void> {
  await client.execute({
    sql: `INSERT OR IGNORE INTO tuning_param (key, value) VALUES ('decay_rate', 0.3), ('trust_quantile', 0.3), ('doubt_quantile', 0.3), ('min_evidence', 5), ('active_partition', 'general')`,
    args: [],
  });
}

export async function handleSessionUpdated(
  client: LibSQLClient,
  event: { properties: { sessionID?: string; info?: { metadata?: { messages?: Array<{ role: string; content: string }> } } } }
): Promise<void> {
  const sessionId = event.properties?.sessionID;
  if (!sessionId) return;

  const info = event.properties?.info;
  if (!info?.metadata?.messages?.length) return;

  const lastAssistant = [...info.metadata.messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant?.content) return;

  const text = typeof lastAssistant.content === "string" ? lastAssistant.content : JSON.stringify(lastAssistant.content);
  const outcome = detectOutcome(text);
  if (outcome === null) return;

  const params = await getTuningParams(client);

  const taskTypeResult = await client.execute({
    sql: `SELECT id FROM task_type WHERE name = ?`,
    args: [params.active_partition],
  });

  const taskTypeId = taskTypeResult.rows.length > 0
    ? (taskTypeResult.rows[0] as { id: number }).id
    : 1;

  const retrievedResult = await client.execute({
    sql: `SELECT memory_id FROM session_memory WHERE session_id = ? ORDER BY retrieved_at DESC`,
    args: [sessionId],
  });

  for (const row of retrievedResult.rows) {
    const r = row as unknown as { memory_id: number };
    await recordOutcome(client, sessionId, r.memory_id, outcome, taskTypeId);
  }

  await client.execute({
    sql: `DELETE FROM session_memory WHERE session_id = ?`,
    args: [sessionId],
  });
}
