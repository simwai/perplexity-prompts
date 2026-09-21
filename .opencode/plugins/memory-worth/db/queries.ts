import type { MemoryInput, SearchResult, TuningParams } from "../core/types.js";
import { computeTrustScore, updateEma } from "../core/trust.js";
import { DEFAULT_TUNING_PARAMS } from "../core/governance.js";

export async function writeMemory(
  client: LibSQLClient,
  input: MemoryInput,
  taskTypeId: number,
  statusId: number
): Promise<{ id: number; content: string; tags: string[]; task_type: string }> {
  const result = await client.execute({
    sql: `INSERT INTO memory (content, status_id) VALUES (?, ?)`,
    args: [input.content, statusId],
  });

  const memoryId = Number(result.lastInsertRowid);

  if (input.tags && input.tags.trim()) {
    const tagNames = input.tags.split(",").map((t) => t.trim()).filter(Boolean);
    for (const tagName of tagNames) {
      const tagResult = await client.execute({
        sql: `INSERT OR IGNORE INTO tag (name) VALUES (?)`,
        args: [tagName],
      });
      const tagIdResult = await client.execute({
        sql: `SELECT id FROM tag WHERE name = ?`,
        args: [tagName],
      });
      const tagRow = tagIdResult.rows[0] as { id: number };
      await client.execute({
        sql: `INSERT OR IGNORE INTO memory_tag_link (memory_id, tag_id) VALUES (?, ?)`,
        args: [memoryId, tagRow.id],
      });
    }
  }

  await client.execute({
    sql: `INSERT OR IGNORE INTO memory_partition (memory_id, task_type_id) VALUES (?, ?)`,
    args: [memoryId, taskTypeId],
  });

  return {
    id: memoryId,
    content: input.content,
    tags: input.tags?.split(",").map((t) => t.trim()).filter(Boolean) ?? [],
    task_type: "general",
  };
}

export async function getMemory(client: LibSQLClient, id: number): Promise<SearchResult | null> {
  const result = await client.execute({
    sql: `SELECT m.id, m.content, m.evidence_count, m.ema_success, m.ema_failure, m.created_at, ms.name as status_name FROM memory m JOIN memory_status ms ON m.status_id = ms.id WHERE m.id = ? AND m.deleted_at IS NULL`,
    args: [id],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0] as unknown as {
    id: number; content: string; evidence_count: number;
    ema_success: number; ema_failure: number; created_at: string; status_name: string;
  };

  const tagsResult = await client.execute({
    sql: `SELECT t.name FROM tag t JOIN memory_tag_link mtl ON t.id = mtl.tag_id WHERE mtl.memory_id = ?`,
    args: [id],
  });
  const tags = tagsResult.rows.map((r) => (r as { name: string }).name).join(",");

  const trust = computeTrustScore(row.ema_success, row.ema_failure);
  return {
    id: row.id,
    content: row.content,
    tags,
    task_type: row.status_name,
    trust_label: trust.label,
    trust_score: Math.round(trust.score * 100) / 100,
    evidence_count: row.evidence_count,
    created_at: row.created_at,
    rank: 0,
  };
}

export async function searchMemories(
  client: LibSQLClient,
  query: string,
  limit: number,
  taskTypeId?: number,
  sessionId?: string
): Promise<SearchResult[]> {
  const sql = `
    SELECT m.id, m.content, m.evidence_count, m.ema_success, m.ema_failure, m.created_at
    FROM memory m
    WHERE m.deleted_at IS NULL AND m.id IN (
      SELECT rowid FROM memory_fts WHERE memory_fts MATCH ? LIMIT ?
    )
  `;
  const args: (string | number)[] = [query, limit * 3];

  let sqlWithFilter = sql;
  if (taskTypeId !== undefined) {
    sqlWithFilter = `
      SELECT m.id, m.content, m.evidence_count, m.ema_success, m.ema_failure, m.created_at
      FROM memory m
      JOIN memory_partition mp ON m.id = mp.memory_id
      WHERE m.deleted_at IS NULL AND m.id IN (
        SELECT rowid FROM memory_fts WHERE memory_fts MATCH ? LIMIT ?
      ) AND mp.task_type_id = ?
    `;
    args.push(taskTypeId);
  }

  const rows = await client.execute({ sql: sqlWithFilter, args });

  const results: SearchResult[] = [];
  for (const row of rows.rows) {
    const r = row as unknown as { id: number; content: string; evidence_count: number; ema_success: number; ema_failure: number; created_at: string };
    const trust = computeTrustScore(r.ema_success, r.ema_failure);

    const tagsResult = await client.execute({
      sql: `SELECT t.name FROM tag t JOIN memory_tag_link mtl ON t.id = mtl.tag_id WHERE mtl.memory_id = ?`,
      args: [r.id],
    });
    const tags = tagsResult.rows.map((tr) => (tr as { name: string }).name).join(",");

    results.push({
      id: r.id,
      content: r.content,
      tags,
      task_type: "general",
      trust_label: trust.label,
      trust_score: Math.round(trust.score * 100) / 100,
      evidence_count: r.evidence_count,
      created_at: r.created_at,
      rank: 0,
    });
  }

  if (sessionId) {
    for (const r of results) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO session_memory (session_id, memory_id) VALUES (?, ?)`,
        args: [sessionId, r.id],
      });
    }
  }

  return results;
}

export async function getTuningParams(client: LibSQLClient): Promise<TuningParams> {
  const result = await client.execute({ sql: `SELECT key, value FROM tuning_param`, args: [] });
  const params: Record<string, number> = {};
  for (const row of result.rows) {
    const r = row as unknown as { key: string; value: number };
    params[r.key] = r.value;
  }
  return { ...DEFAULT_TUNING_PARAMS, ...params };
}

export async function updateTrustScore(
  client: LibSQLClient,
  memoryId: number,
  outcome: boolean,
  taskTypeId: number
): Promise<void> {
  const params = await getTuningParams(client);
  const decay = params.decay_rate;

  const memResult = await client.execute({
    sql: `SELECT ema_success, ema_failure, evidence_count FROM memory WHERE id = ?`,
    args: [memoryId],
  });

  if (memResult.rows.length === 0) return;
  const mem = memResult.rows[0] as unknown as { ema_success: number; ema_failure: number; evidence_count: number };

  const newEma = updateEma(mem.ema_success, mem.ema_failure, outcome, decay);

  await client.execute({
    sql: `UPDATE memory SET ema_success = ?, ema_failure = ?, evidence_count = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [newEma.ema_success, newEma.ema_failure, mem.evidence_count + 1, memoryId],
  });

  const partResult = await client.execute({
    sql: `SELECT id, ema_success, ema_failure, evidence_count FROM memory_partition WHERE memory_id = ? AND task_type_id = ?`,
    args: [memoryId, taskTypeId],
  });

  if (partResult.rows.length > 0) {
    const part = partResult.rows[0] as unknown as { id: number; ema_success: number; ema_failure: number; evidence_count: number };
    const newPartEma = updateEma(part.ema_success, part.ema_failure, outcome, decay);
    await client.execute({
      sql: `UPDATE memory_partition SET ema_success = ?, ema_failure = ?, evidence_count = ? WHERE id = ?`,
      args: [newPartEma.ema_success, newPartEma.ema_failure, part.evidence_count + 1, part.id],
    });
  } else {
    await client.execute({
      sql: `INSERT INTO memory_partition (memory_id, task_type_id, ema_success, ema_failure, evidence_count) VALUES (?, ?, ?, ?, ?)`,
      args: [memoryId, taskTypeId, newEma.ema_success, newEma.ema_failure, 1],
    });
  }
}
