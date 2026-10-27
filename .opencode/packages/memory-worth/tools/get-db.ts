import type { Client } from "@libsql/client";
import { createConnection, getConnection } from "../db/connection.js";
import { runOneTimeImport } from "../db/queries.js";

export async function getToolDb(_directory: string): Promise<Client> {
  const db = getConnection() ?? await createConnection();
  await runOneTimeImport(db, _directory);
  return db;
}
