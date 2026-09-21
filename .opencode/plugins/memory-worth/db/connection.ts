import { createClient, type Client } from "@libsql/client";
import { shimPath } from "../runtime/shim/path.js";

const DB_FILENAME = "memory.db";
const DB_DIR = ".opencode";

let client: Client | null = null;

export type DbClient = Client;

export function getDbPath(baseDir: string): string {
  const path = shimPath();
  const dir = path.resolve(baseDir, DB_DIR);
  return path.join(dir, DB_FILENAME);
}

export async function createConnection(baseDir: string): Promise<Client> {
  if (client) return client;

  const path = shimPath();
  const dir = path.resolve(baseDir, DB_DIR);

  const { mkdir } = await import("node:fs/promises");
  try { await mkdir(dir, { recursive: true }); } catch { /* exists */ }

  const dbPath = path.join(dir, DB_FILENAME);
  client = createClient({ url: `file:${dbPath}`, intMode: "number" });

  await runMigrations(client);
  return client;
}

export function getConnection(): Client | null {
  return client;
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

async function runMigrations(db: Client): Promise<void> {
  const { MIGRATIONS } = await import("./schema.js");
  await db.execute({ sql: `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`, args: [] });

  const versionResult = await db.execute({ sql: `SELECT MAX(version) as v FROM schema_version`, args: [] });
  const currentVersion = (versionResult.rows[0] as { v: number | undefined })?.v ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    for (const sql of migration.statements) {
      await db.execute({ sql, args: [] });
    }

    for (const seed of migration.seed ?? []) {
      await db.execute({ sql: seed.sql, args: seed.args });
    }

    for (const p of migration.params ?? []) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO tuning_param (key, value) VALUES (?, ?)`,
        args: [p.key, p.value],
      });
    }

    await db.execute({ sql: `INSERT INTO schema_version (version) VALUES (?)`, args: [migration.version] });
  }
}