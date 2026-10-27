import { createClient, type Client } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import { resolve, dirname, join, basename, isAbsolute, sep } from "node:path";
import { runMigrations } from "./migrate.js";

const DB_FILENAME = "memory.db";

let client: Client | null = null;

export type DbClient = Client;

/**
 * Resolves the machine-level memory DB path. Resolution order:
 *
 *  1. MEMORY_WORTH_DB — explicit full path to the SQLite file
 *  2. MEMORY_WORTH_HOME — directory; DB is <home>/memory.db
 *  3. MEMORY_WORTH_DIR — deprecated alias for #2
 *  4. %LOCALAPPDATA%\memory-worth\memory.db (Windows) or
 *     $XDG_DATA_HOME/memory-worth/memory.db or ~/.local/share/memory-worth/memory.db
 *
 * When `cwd` is supplied, it is used instead (<cwd>/.opencode/memory.db).
 * This override exists only for test isolation; production callers omit it.
 */
export function getDbPath(cwd?: string): string {
  if (cwd) {
    return join(resolve(cwd, ".opencode"), DB_FILENAME);
  }

  const explicit = process.env.MEMORY_WORTH_DB;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const home = process.env.MEMORY_WORTH_HOME || process.env.MEMORY_WORTH_DIR;
  if (home && home.trim()) {
    return join(resolve(home.trim()), DB_FILENAME);
  }

  const dataHome =
    process.env.LOCALAPPDATA ||
    process.env.XDG_DATA_HOME ||
    (process.env.HOME ? join(process.env.HOME, ".local", "share") : resolve("."));
  return join(dataHome, "memory-worth", DB_FILENAME);
}

export async function createConnection(cwd?: string): Promise<Client> {
  if (client) return client;

  const dbPath = getDbPath(cwd);
  const dir = dirname(dbPath);
  try {
    await mkdir(dir, { recursive: true });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "EEXIST") {
      // directory already exists
    } else {
      throw e;
    }
  }

  const created = createClient({ url: `file:${dbPath}`, intMode: "number" });

  // WAL mode allows concurrent readers and a single writer; busy_timeout
  // prevents SQLITE_BUSY when opencode, Kilo, and desktop MCP clients share
  // the same file.
  await created.execute({ sql: `PRAGMA journal_mode=WAL`, args: [] });
  await created.execute({ sql: `PRAGMA busy_timeout=5000`, args: [] });

  await runMigrations(created);
  client = created;
  return client;
}

export function getConnection(): Client | null {
  return client;
}

export function closeConnection(): void {
  if (client) {
    client.close();
    client = null;
  }
}
