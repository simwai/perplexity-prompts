export const SCHEMA_VERSION = 1;

export type Migration = {
  version: number;
  statements: string[];
  seed?: Array<{ sql: string; args: unknown[] }>;
  params?: Array<{ key: string; value: number }>;
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS memory_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS task_type (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS tag (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        ema_success REAL NOT NULL DEFAULT 0.5,
        ema_failure REAL NOT NULL DEFAULT 0.5,
        evidence_count INTEGER NOT NULL DEFAULT 0,
        status_id INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY (status_id) REFERENCES memory_status(id)
      )`,
      `CREATE TABLE IF NOT EXISTS memory_tag_link (
        memory_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (memory_id, tag_id),
        FOREIGN KEY (memory_id) REFERENCES memory(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS memory_partition (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id INTEGER NOT NULL,
        task_type_id INTEGER NOT NULL,
        ema_success REAL NOT NULL DEFAULT 0.5,
        ema_failure REAL NOT NULL DEFAULT 0.5,
        evidence_count INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (memory_id) REFERENCES memory(id) ON DELETE CASCADE,
        FOREIGN KEY (task_type_id) REFERENCES task_type(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS outcome (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        memory_id INTEGER,
        task_type_id INTEGER NOT NULL,
        outcome INTEGER NOT NULL,
        logged_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (memory_id) REFERENCES memory(id),
        FOREIGN KEY (task_type_id) REFERENCES task_type(id)
      )`,
      `CREATE TABLE IF NOT EXISTS tuning_param (
        key TEXT PRIMARY KEY,
        value REAL NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS tuning_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        changed_at TEXT NOT NULL DEFAULT (datetime('now')),
        changed_by TEXT,
        rationale TEXT NOT NULL,
        old_values TEXT NOT NULL,
        new_values TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS session_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        memory_id INTEGER NOT NULL,
        retrieved_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (memory_id) REFERENCES memory(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_memory_status ON memory(status_id)`,
      `CREATE INDEX IF NOT EXISTS idx_memory_created ON memory(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_memory_deleted ON memory(deleted_at)`,
      `CREATE INDEX IF NOT EXISTS idx_outcome_session ON outcome(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_outcome_memory ON outcome(memory_id)`,
      `CREATE INDEX IF NOT EXISTS idx_session_memory_session ON session_memory(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_session_memory_memory ON session_memory(memory_id)`,
    ],
    seed: [
      { sql: `INSERT OR IGNORE INTO memory_status (name) VALUES ('active'), ('archived'), ('invalidated'), ('merged')`, args: [] },
    ],
    params: [
      { key: "decay_rate", value: 0.3 },
      { key: "trust_quantile", value: 0.3 },
      { key: "doubt_quantile", value: 0.3 },
      { key: "min_evidence", value: 5 },
      { key: "active_partition", value: "general" },
    ],
  },
];