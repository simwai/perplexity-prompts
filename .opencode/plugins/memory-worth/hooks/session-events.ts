import type { Client } from "@libsql/client";
import { asNumber, asText } from "../db/decode.js";
import { ensureTaskType, getTuningParams, labelMemory, setStatusFull } from "../db/queries.js";
import { epochInt } from "../db/epoch.js";
import { DEFAULT_GOVERNANCE_POLICY, computeStatus } from "../core/governance.js";

export async function handleSessionCreated(db: Client): Promise<void> {
  await ensureTaskType(db, "general");
}

export async function handleSessionIdle(db: Client, sessionId: string): Promise<{ discarded: number; kept: number; archived: number }> {
  const open = await db.execute({
    sql: `SELECT id FROM episode WHERE session_id = ? AND resolved_at IS NULL`,
    args: [sessionId],
  });
  let discarded = 0;
  let kept = 0;
  for (const row of open.rows) {
    const episodeId = asNumber(row["id"]);
    const entries = await db.execute({
      sql: `SELECT id FROM calibration_entry WHERE episode_id = ? LIMIT 1`,
      args: [episodeId],
    });
    if (entries.rows.length === 0) {
      await db.execute({ sql: `DELETE FROM episode WHERE id = ?`, args: [episodeId] });
      discarded += 1;
    } else {
      kept += 1;
    }
  }

  // Governance sweep: archive old low-trust memories
  let archived = 0;
  try {
    const params = await getTuningParams(db);
    const policy = DEFAULT_GOVERNANCE_POLICY;
    const cutoff = epochInt() - policy.auto_archive_after_days * 86400000;

    const oldMemories = await db.execute({
      sql: `SELECT m.id, m.mw, m.s_plus, m.s_minus, m.created_at FROM memory m JOIN memory_status ms ON m.status_id = ms.id WHERE ms.name = 'active' AND m.created_at < ?`,
      args: [cutoff],
    });

    for (const row of oldMemories.rows) {
      const ageDays = (epochInt() - asNumber(row["created_at"])) / 86400000;
      const trustLabel = await labelMemory(db, asNumber(row["mw"]), asNumber(row["s_plus"]), asNumber(row["s_minus"]));
      const newStatus = computeStatus(trustLabel, ageDays, policy);
      if (newStatus === "archived") {
        await setStatusFull(db, asNumber(row["id"]), "archived");
        archived++;
      }
    }
  } catch {
    // Governance is best-effort; don't break session on failure
  }

  return { discarded, kept, archived };
}

export async function handleSessionCompacted(db: Client, sessionId: string): Promise<{ unresolved_entries: number }> {
  const rows = await db.execute({
    sql: `SELECT COUNT(*) AS cnt FROM calibration_entry ce JOIN episode e ON e.id = ce.episode_id WHERE e.session_id = ? AND e.resolved_at IS NULL`,
    args: [sessionId],
  });

  // Also run governance on compaction
  await handleSessionIdle(db, sessionId);

  return { unresolved_entries: asNumber(rows.rows[0]?.["cnt"]) };
}

/**
 * Handle "forget that rule" / "forget that" commands.
 * Archives the most recent user-captured memory.
 * Returns true if a memory was archived, false otherwise.
 */
export async function handleForgetCommand(db: Client, sessionId: string, userText: string): Promise<boolean> {
  const forgetPatterns = [
    /forget that rule/i,
    /forget that$/i,
    /remove that rule/i,
    /delete that rule/i,
  ];

  if (!forgetPatterns.some(p => p.test(userText))) return false;

  // Find most recent user-captured memory (source = 'user')
  const recent = await db.execute({
    sql: `SELECT m.id, m.content FROM memory m
          JOIN memory_source ms ON m.source_id = ms.id
          WHERE ms.name = 'user' AND m.status_id = (SELECT id FROM memory_status WHERE name = 'active')
          ORDER BY m.created_at DESC LIMIT 1`,
    args: [],
  });

  if (recent.rows.length > 0) {
    const memoryId = asNumber(recent.rows[0]["id"]);
    await setStatusFull(db, memoryId, "archived");
    return true;
  }
  return false;
}
