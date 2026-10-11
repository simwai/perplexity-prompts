/**
 * Baba Debug Library
 * Unified debug infrastructure for all Baba plugins.
 * Supports 4 output destinations: console.error, file (JSONL), client.app.log, structured tools.
 */

import { type Plugin } from "@opencode-ai/plugin";

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

function parseDebugEnv(): DebugConfig {
  const debugEnv = process.env.BABA_DEBUG;
  const levelEnv = (process.env.BABA_DEBUG_LEVEL ?? "info").toLowerCase() as DebugLevel;
  const fileEnv = process.env.BABA_DEBUG_FILE;
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

  const destinations: LogDestination[] = ["console", "client"];
  if (fileEnv) destinations.push("file");

  return {
    enabled: enabledPlugins.length > 0 || enabledPlugins === "*",
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
  if (globalConfig.enabled !== "*" && !globalConfig.enabled.includes(pluginName)) return false;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[globalConfig.level];
}

function writeToConsole(entry: DebugEntry): void {
  const metaStr = Object.keys(entry.meta).length > 0 
    ? ` ${JSON.stringify(entry.meta)}` 
    : "";
  console.error(`[${entry.plugin}] ${entry.level.toUpperCase()}: ${entry.msg}${metaStr}`);
}

async function writeToFile(entry: DebugEntry, filePath: string, maxLines: number): Promise<void> {
  const line = JSON.stringify(entry);
  const buffer = fileBuffers.get(filePath) ?? [];
  buffer.push(line);
  
  if (buffer.length > maxLines) {
    buffer.splice(0, buffer.length - maxLines);
  }
  fileBuffers.set(filePath, buffer);

  // Async flush - don't await to avoid blocking
  try {
    const fs = await import("node:fs/promises");
    await fs.writeFile(filePath, buffer.join("\n") + "\n", { flag: "a" });
    buffer.length = 0; // Clear after successful write
  } catch {
    // Keep in buffer for next attempt
  }
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
 * Flush any pending file buffers. Call on session end.
 */
export async function flushDebugBuffers(): Promise<void> {
  for (const [filePath, buffer] of fileBuffers.entries()) {
    if (buffer.length > 0) {
      try {
        const fs = await import("node:fs/promises");
        await fs.writeFile(filePath, buffer.join("\n") + "\n", { flag: "a" });
        buffer.length = 0;
      } catch {
        // Best effort
      }
    }
  }
}

export default async () => ({});