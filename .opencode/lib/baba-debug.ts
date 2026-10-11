/**
 * Baba Debug Library
 * Unified debug infrastructure for all Baba plugins.
 * Supports 4 output destinations: console.error, file (JSONL), client.app.log, structured tools.
 */

import { type Plugin } from "@opencode-ai/plugin";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type DebugLevel = "debug" | "info" | "warn" | "error";

export interface DebugMeta {
  session?: string;
  [key: string]: unknown;
}

export interface DebugEntry {
  ts: string;
  plugin: string;
  level: DebugLevel;
  msg: string;
  meta: DebugMeta;
}

type LogDestination = "console" | "file" | "client" | "all";

interface DebugConfig {
  enabled: boolean;
  pluginFilter: string[] | "*";
  level: DebugLevel;
  destinations: LogDestination[];
  filePath?: string;
  maxFileLines: number;
}

const LEVEL_ORDER: Record<DebugLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let globalConfig: DebugConfig | null = null;
const fileBuffers = new Map<string, string[]>();
const fileWriteQueues = new Map<string, Promise<void>>();
const fileLineCounts = new Map<string, number>();

/**
 * Default JSONL sink.
 *
 * The opencode config schema sets `Config.additionalProperties: false` and
 * declares no `env` property, so a config-declared BABA_DEBUG_FILE is silently
 * dropped and never reaches `process.env`. Defaulting the path here keeps the
 * file destination alive without an out-of-band OS environment variable.
 * BABA_DEBUG_FILE still overrides it when it really is set.
 */
export const DEFAULT_DEBUG_FILE = join(tmpdir(), "baba-debug.jsonl");

function parseDebugEnv(): DebugConfig {
  const debugEnv = process.env.BABA_DEBUG;
  const levelEnv = (process.env.BABA_DEBUG_LEVEL ?? "info").toLowerCase() as DebugLevel;
  const fileEnv = process.env.BABA_DEBUG_FILE || DEFAULT_DEBUG_FILE;
  const maxLinesEnv = parseInt(process.env.BABA_DEBUG_MAX_LINES ?? "10000", 10);

  // Default: all plugins enabled unless explicitly disabled
  let enabledPlugins: string[] | "*" = "*";
  if (debugEnv !== undefined) {
    if (debugEnv === "") {
      enabledPlugins = []; // Explicitly disabled
    } else if (debugEnv === "*") {
      enabledPlugins = "*";
    } else {
      enabledPlugins = debugEnv.split(",").map(s => s.trim()).filter(Boolean);
    }
  }

  const destinations: LogDestination[] = ["console", "client", "file"];

  // Store the plugin filter (string[] | "*") in enabled for shouldLog to use
  // Boolean enabled flag is derived from it
  const isEnabled = enabledPlugins.length > 0 || enabledPlugins === "*";

  return {
    enabled: isEnabled,
    pluginFilter: enabledPlugins,
    level: LEVEL_ORDER[levelEnv] !== undefined ? levelEnv : "info",
    destinations,
    filePath: fileEnv,
    maxFileLines: maxLinesEnv,
  };
}

function shouldLog(pluginName: string, level: DebugLevel): boolean {
  if (!globalConfig) {
    globalConfig = parseDebugEnv();
  }
  if (!globalConfig.enabled) return false;
  const filter = (globalConfig as any).pluginFilter ?? "*";
  if (filter !== "*" && !filter.includes(pluginName)) return false;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[globalConfig.level];
}

function writeToConsole(entry: DebugEntry): void {
  const metaStr = Object.keys(entry.meta).length > 0 
    ? ` ${JSON.stringify(entry.meta)}` 
    : "";
  console.error(`[${entry.plugin}] ${entry.level.toUpperCase()}: ${entry.msg}${metaStr}`);
}

/**
 * Keep only the newest `maxLines` entries.
 *
 * The buffer limit alone never trimmed the file: every flush appended and then
 * cleared the in-memory buffer, so the on-disk log grew without bound for the
 * whole process lifetime.
 */
async function rotateIfOversized(filePath: string, maxLines: number, added: number): Promise<void> {
  const written = (fileLineCounts.get(filePath) ?? 0) + added;
  fileLineCounts.set(filePath, written);
  if (written <= maxLines) return;

  const fs = await import("node:fs/promises");
  const lines = (await fs.readFile(filePath, "utf-8")).split("\n").filter(Boolean);
  const kept = lines.slice(-maxLines);
  await fs.writeFile(filePath, `${kept.join("\n")}\n`, "utf-8");
  fileLineCounts.set(filePath, kept.length);
}

async function writeToFile(entry: DebugEntry, filePath: string, maxLines: number): Promise<void> {
  const buffer = fileBuffers.get(filePath) ?? [];
  buffer.push(JSON.stringify(entry));
  fileBuffers.set(filePath, buffer);

  // Serialize per path. Concurrent emit() calls share one buffer, so an
  // unserialized append can flush the same line twice or interleave two writes.
  const queued = (fileWriteQueues.get(filePath) ?? Promise.resolve())
    .then(async () => {
      const pending = fileBuffers.get(filePath) ?? [];
      if (pending.length === 0) return;
      const batch = pending.splice(0, pending.length);
      const fs = await import("node:fs/promises");
      try {
        await fs.appendFile(filePath, `${batch.join("\n")}\n`, "utf-8");
      } catch (err) {
        // Requeue so the next flush retries rather than losing the entries.
        const current = fileBuffers.get(filePath) ?? [];
        current.unshift(...batch);
        fileBuffers.set(filePath, current);
        throw err;
      }
      await rotateIfOversized(filePath, maxLines, batch.length);
    })
    .catch(() => {
      // Logging must never break the caller.
    });

  fileWriteQueues.set(filePath, queued);
  await queued;
}

async function writeToClient(client: any, entry: DebugEntry): Promise<void> {
  try {
    await client.app.log({
      body: {
        service: entry.plugin,
        level: entry.level,
        message: entry.msg,
        extra: entry.meta,
      },
    });
  } catch {
    // client.app.log may not be available in all contexts
  }
}

export class BabaDebug {
  private pluginName: string;
  private client: any;
  private config: DebugConfig;

  constructor(pluginName: string, client?: any) {
    this.pluginName = pluginName;
    this.client = client;
    this.config = parseDebugEnv();
  }

  private shouldLog(level: DebugLevel): boolean {
    const filter = (this.config as any).pluginFilter ?? "*";
    if (filter !== "*" && !filter.includes(this.pluginName)) return false;
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.config.level];
  }

  private async emit(level: DebugLevel, msg: string, meta: DebugMeta = {}): Promise<void> {
    if (!this.shouldLog(level)) return;

    const entry: DebugEntry = {
      ts: new Date().toISOString(),
      plugin: this.pluginName,
      level,
      msg,
      meta: { session: meta.session, ...meta },
    };

    const promises: Promise<void>[] = [];

    if (this.config.destinations.includes("console") || this.config.destinations.includes("all")) {
      writeToConsole(entry);
    }

    if ((this.config.destinations.includes("file") || this.config.destinations.includes("all")) && this.config.filePath) {
      promises.push(writeToFile(entry, this.config.filePath, this.config.maxFileLines));
    }

    if ((this.config.destinations.includes("client") || this.config.destinations.includes("all")) && this.client) {
      promises.push(writeToClient(this.client, entry));
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  debug(msg: string, meta?: DebugMeta): Promise<void> {
    return this.emit("debug", msg, meta);
  }

  info(msg: string, meta?: DebugMeta): Promise<void> {
    return this.emit("info", msg, meta);
  }

  warn(msg: string, meta?: DebugMeta): Promise<void> {
    return this.emit("warn", msg, meta);
  }

  error(msg: string, meta?: DebugMeta): Promise<void> {
    return this.emit("error", msg, meta);
  }

  /**
   * Dump internal state for debugging. Logs at debug level with structured meta.
   */
  stateDump(label: string, state: unknown): Promise<void> {
    const meta: DebugMeta = {
      label,
      stateType: typeof state,
      stateKeys: state && typeof state === "object" ? Object.keys(state as object) : [],
      stateValue: state,
    };
    return this.emit("debug", `STATE DUMP: ${label}`, meta);
  }

  /**
   * Create a child logger with additional default meta (e.g., sessionId).
   */
  child(defaultMeta: DebugMeta): BabaDebug {
    const child = new BabaDebug(this.pluginName, this.client);
    const originalEmit = child.emit.bind(child);
    child.emit = async (level, msg, meta) => {
      await originalEmit(level, msg, { ...defaultMeta, ...meta });
    };
    return child;
  }

  /**
   * Check if debug is enabled for this plugin at given level.
   */
  isEnabled(level: DebugLevel = "debug"): boolean {
    return this.shouldLog(level);
  }
}

/**
 * Factory function for plugin entry points.
 * Usage: const log = createDebug("my-plugin", client);
 */
export function createDebug(pluginName: string, client?: any): BabaDebug {
  return new BabaDebug(pluginName, client);
}

/**
 * Global config accessor for tools that need to read current settings.
 */
export function getDebugConfig(): DebugConfig {
  if (!globalConfig) {
    globalConfig = parseDebugEnv();
  }
  return { ...globalConfig };
}

/**
 * Flush anything still buffered. Normal flushes drain on their own, so this is
 * a shutdown safety net: await the per-path queue first, then append whatever
 * survived a failed write.
 */
export async function flushDebugBuffers(): Promise<void> {
  const { maxFileLines } = getDebugConfig();
  for (const [filePath, buffer] of fileBuffers) {
    await fileWriteQueues.get(filePath);
    const pending = buffer.splice(0, buffer.length);
    if (pending.length === 0) continue;
    const fs = await import("node:fs/promises");
    try {
      await fs.appendFile(filePath, `${pending.join("\n")}\n`, "utf-8");
      await rotateIfOversized(filePath, maxFileLines, pending.length);
    } catch {
      buffer.unshift(...pending);
    }
  }
}

export default async () => ({});