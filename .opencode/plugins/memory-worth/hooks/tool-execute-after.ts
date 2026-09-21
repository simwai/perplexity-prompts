import { updateTrustScore } from "../db/queries.js";

const SUCCESS_SIGNALS = [
  /\bfixed\b/i, /\bpassing\b/i, /\bworks\b(?:\s+now)?\b/i, /\bresolved\b/i,
  /\bdone\b/i, /\bcompleted?\b/i, /\bsuccess\b/i, /\bworking\b/i, /\bmerged?\b/i,
  /\bverified\b/i, /\bconfirmed\b/i, /\bclosed?\b/i, /\bshipped?\b/i
];

const FAILURE_SIGNALS = [
  /\bfail(?:s|ed|ure)?\b/i, /\bbroken\b/i, /\berror\b/i, /\bregression\b/i,
  /\bnot\s+working\b/i, /\bstill\s+broken\b/i, /\bdoesn'?t\s+work\b/i,
  /\bcrashes?\b/i, /\btimeout\b/i, /\bincorrect\b/i, /\bbug\b/i
];

export function detectOutcome(text: string): boolean | null {
  const hasSuccess = SUCCESS_SIGNALS.some((re) => re.test(text));
  const hasFailure = FAILURE_SIGNALS.some((re) => re.test(text));
  if (hasSuccess && !hasFailure) return true;
  if (hasFailure && !hasSuccess) return false;
  return null;
}

export async function recordOutcome(
  client: LibSQLClient,
  sessionId: string,
  memoryId: number,
  outcome: boolean,
  taskTypeId: number
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO outcome (session_id, memory_id, task_type_id, outcome) VALUES (?, ?, ?, ?)`,
    args: [sessionId, memoryId, taskTypeId, outcome ? 1 : 0],
  });

  await updateTrustScore(client, memoryId, outcome, taskTypeId);
}
