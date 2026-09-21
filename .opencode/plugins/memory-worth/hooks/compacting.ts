export async function handleCompacting(
  client: LibSQLClient,
  event: { properties: { sessionID?: string; info?: unknown } }
): Promise<void> {
  const sessionId = event.properties?.sessionID;
  if (!sessionId) return;

  await client.execute({
    sql: `DELETE FROM session_memory WHERE session_id = ?`,
    args: [sessionId],
  });
}
