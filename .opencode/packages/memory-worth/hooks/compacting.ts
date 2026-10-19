import type { Client } from "@libsql/client";
import { asNumber, asText } from "../db/decode.js";

export async function buildCompactionContext(db: Client, sessionId: string): Promise<string[]> {
  const currents = await db.execute({
    sql: `SELECT COUNT(*) AS count FROM memory m JOIN memory_status ms ON m.status_id = ms.id WHERE ms.name = 'active'`,
    args: [],
  });
  const count = currents.rows[0]?.count ?? 0;
  return [
    `memory-worth: ${count} memories preserved across compaction for session ${sessionId}.`,
  ];
}
