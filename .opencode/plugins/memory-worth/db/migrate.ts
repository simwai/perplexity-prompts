import { createConnection, closeConnection } from "./connection.js";
import { MIGRATIONS, SCHEMA_VERSION } from "./schema.js";

export async function runMigrations(client: ReturnType<typeof createConnection> extends Promise<infer T> ? T : never): Promise<void> {
  const db = await client;

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

export async function getSchemaVersion(client: ReturnType<typeof createConnection> extends Promise<infer T> ? T : never): Promise<number> {
  const db = await client;
  const result = await db.execute({ sql: `SELECT MAX(version) as v FROM schema_version`, args: [] });
  return (result.rows[0] as { v: number | undefined })?.v ?? 0;
}

export { SCHEMA_VERSION };
