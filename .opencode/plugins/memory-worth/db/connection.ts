import { createClient, type LibSQLClient } from "@libsql/client";
import { shimPath } from "../runtime/shim/path.js";

const DB_FILENAME = "memory.db";
const DB_DIR = ".opencode";

let client: LibSQLClient | null = null;

export function getDbPath(baseDir: string): string {
  const path = shimPath();
  const dir = path.resolve(baseDir, DB_DIR);
  return path.join(dir, DB_FILENAME);
}

export async function createConnection(baseDir: string): Promise<LibSQLClient> {
  if (client) return client;

  const path = shimPath();
  const dir = path.resolve(baseDir, DB_DIR);

  const fs = await import("node:fs");
  const { mkdir } = await import("node:fs/promises");
  try { await mkdir(dir, { recursive: true }); } catch { /* exists */ }

  const dbPath = path.join(dir, DB_FILENAME);
  client = createClient({ url: `file:${dbPath}`, intMode: "number" });

  await runMigrations(client);
  return client;
}

export function getConnection(): LibSQLClient | null {
  return client;
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
