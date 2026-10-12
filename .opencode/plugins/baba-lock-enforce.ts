/**
 * Lock Enforcement Plugin for opencode (V2)
 *
 * Surfaces session-lock contention for two editing sessions sharing one checkout.
 *
 * Storage is the on-disk protocol owned by prompt-system/scripts/session-locks.ps1,
 * so locks taken here are visible to that module and to an operator inspecting
 * .session-locks/, and vice versa:
 *   <repo>/.session-locks/<relative-path>--with--dashes.lock/
 *       owner            session id that holds the lock
 *       acquired_at      ISO-8601 UTC timestamp
 *       dependencies.txt optional, one repo-relative path per line
 *
 * Acquisition uses mkdir, which throws EEXIST when the directory is already
 * present. That is the same exclusive primitive the PowerShell module gets
 * from [System.IO.Directory]::Move, so two sessions cannot both win the race.
 *
 * Why contention is blocked but an absent lock is not:
 * prompt-system/scripts/session-locks.ps1 states that enforcement belongs at
 * the commit gate rather than mid-edit, because a mid-edit block "can wedge the
 * very session that legitimately holds the lock". This plugin therefore does
 * exactly one blocking case -- another live session already holds the file --
 * which is the real conflict. Writing a file nobody has locked stays allowed
 * and is only recorded, so an agent that never took a lock is never trapped.
 *
 * A lock is never stolen. Contention is reported with the decision set the
 * caller has to make; the plugin does not pick for them.
 *
 * Inert on a READ_ONLY host (BABA_READ_ONLY=1).
 *
 * V2 changes: entrypoint, tool registration, and the execute.before hook moved
 * to the V2 APIs. The on-disk lock protocol, the TTL, and the contention rules
 * are unchanged.
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";

/** Mirrors ConvertTo-FlatName: strip leading ./ or /, then separators become --. */
function toFlatName(repoRelativePath: string): string {
  return repoRelativePath.replace(/\\/g, "/").replace(/^[./]+/, "").replace(/[/\\]/g, "--");
}

const WRITE_TOOLS = new Set(["write", "edit", "patch"]);

/** Matches $script:LockTtlMinutes in session-locks.ps1. */
const LOCK_TTL_MINUTES = 30;

function isReadOnlyHost(): boolean {
  const flag = process.env.BABA_READ_ONLY;
  return flag === "1" || flag === "true";
}

function getLockRoot(repoRoot: string): string {
  return resolve(repoRoot, ".session-locks");
}

function toRepoRelative(path: string, repoRoot: string): string {
  const normalized = path.replace(/\\/g, "/");
  const root = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized.startsWith(root + "/")) return normalized.slice(root.length + 1);
  if (/^[a-zA-Z]:\//.test(normalized)) return normalized.replace(/^\/?[a-zA-Z]:\//, "");
  return normalized.replace(/^\/+/, "").replace(/^\.\//, "");
}

interface LockInfo {
  owner: string | null;
  acquiredAt: string | null;
  dependencies: string[];
}

/** Mirrors Test-LockLive: liveness from acquired_at only, never directory mtime. */
function isLive(info: LockInfo): boolean {
  if (!info.acquiredAt) return false;
  const acquired = Date.parse(info.acquiredAt);
  if (Number.isNaN(acquired)) return false;
  return Date.now() - acquired < LOCK_TTL_MINUTES * 60_000;
}

async function readLockInfo(lockPath: string): Promise<LockInfo> {
  const info: LockInfo = { owner: null, acquiredAt: null, dependencies: [] };
  try {
    info.owner = (await readFile(resolve(lockPath, "owner"), "utf-8")).trim();
  } catch {
    /* absent owner file */
  }
  try {
    info.acquiredAt = (await readFile(resolve(lockPath, "acquired_at"), "utf-8")).trim();
  } catch {
    /* absent timestamp */
  }
  try {
    const raw = await readFile(resolve(lockPath, "dependencies.txt"), "utf-8");
    info.dependencies = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    /* optional file */
  }
  return info;
}

interface LockEntry {
  lockPath: string;
  info: LockInfo;
}

async function readLiveLocks(repoRoot: string): Promise<LockEntry[]> {
  const root = getLockRoot(repoRoot);
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }

  const live: LockEntry[] = [];

  for (const name of names) {
    if (!name.endsWith(".lock")) continue;
    const lockPath = resolve(root, name);
    try {
      const s = await stat(lockPath);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }

    const info = await readLockInfo(lockPath);
    if (!isLive(info)) {
      // Abandoned: reap it so a crashed session cannot block a path forever.
      try {
        await rm(lockPath, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
      continue;
    }
    live.push({ lockPath, info });
  }

  return live;
}

interface Contention {
  held: boolean;
  owner: string;
  lockPath: string;
  dependencies: string[];
}

/**
 * Contention for a path is found two ways:
 *   1. directly -- the lock path is deterministic from the relative path, so
 *      there is exactly one candidate to check. The directory name carries no
 *      owner, so the name must not be parsed to recover the path.
 *   2. transitively -- a live lock whose dependencies.txt lists this path.
 */
async function findContention(
  repoRoot: string,
  sessionId: string,
  filePath: string,
): Promise<Contention | null> {
  const repoPath = toRepoRelative(filePath, repoRoot);
  const live = await readLiveLocks(repoRoot);
  const target = resolve(repoRoot, repoPath);

  const directPath = resolve(getLockRoot(repoRoot), `${toFlatName(repoPath)}.lock`);
  const direct = live.find((entry) => entry.lockPath === directPath);
  if (direct) {
    if (direct.info.owner === sessionId) return null;
    return {
      held: true,
      owner: direct.info.owner ?? "unknown",
      lockPath: direct.lockPath,
      dependencies: direct.info.dependencies,
    };
  }

  for (const entry of live) {
    if (entry.info.owner === sessionId) continue;
    const covers = entry.info.dependencies.some((dep) => {
      try {
        return resolve(repoRoot, dep) === target;
      } catch {
        return false;
      }
    });
    if (!covers) continue;
    return {
      held: true,
      owner: entry.info.owner ?? "unknown",
      lockPath: entry.lockPath,
      dependencies: entry.info.dependencies,
    };
  }

  return null;
}

interface AcquireOutcome {
  Success: boolean;
  FlatName?: string;
  Blocked?: boolean;
  Owner?: string;
  Decision?: string[];
  error?: string;
}

async function acquireFileLock(
  repoRoot: string,
  sessionId: string,
  filePath: string,
  dependencies: string[],
): Promise<AcquireOutcome> {
  const repoPath = toRepoRelative(filePath, repoRoot);
  const flat = toFlatName(repoPath);
  const lockPath = resolve(getLockRoot(repoRoot), `${flat}.lock`);

  try {
    await mkdir(resolve(lockPath, ".."), { recursive: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { Success: false, error: `cannot prepare lock root: ${message}` };
  }

  // EEXIST is the exclusive signal: another session already holds this path.
  try {
    await mkdir(lockPath);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "EEXIST") {
      const message = err instanceof Error ? err.message : String(err);
      return { Success: false, error: `cannot create lock: ${message}` };
    }
    const existing = await readLockInfo(lockPath);
    if (isLive(existing)) {
      return {
        Success: false,
        Blocked: true,
        Owner: existing.owner ?? "unknown",
        Decision: [
          "wait -- the other session is still editing this file",
          "coordinate -- hand the edit to that session",
          "release -- confirm the other session is idle, then release its lock",
        ],
      };
    }
    // Abandoned lock: reclaim it.
    await rm(lockPath, { recursive: true, force: true }).catch(() => {});
    await mkdir(lockPath);
  }

  try {
    await writeFile(resolve(lockPath, "owner"), sessionId, "utf-8");
    await writeFile(resolve(lockPath, "acquired_at"), new Date().toISOString(), "utf-8");
    if (dependencies.length > 0) {
      await writeFile(resolve(lockPath, "dependencies.txt"), dependencies.join("\n"), "utf-8");
    }
  } catch (err: unknown) {
    await rm(lockPath, { recursive: true, force: true }).catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    return { Success: false, error: `cannot write lock metadata: ${message}` };
  }

  return { Success: true, FlatName: `${flat}.lock` };
}

async function releaseFileLock(repoRoot: string, filePath: string): Promise<{ Success: boolean; Reason?: string }> {
  const lockPath = resolve(getLockRoot(repoRoot), `${toFlatName(toRepoRelative(filePath, repoRoot))}.lock`);
  try {
    await rm(lockPath, { recursive: true, force: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { Success: false, Reason: `cannot remove lock: ${message}` };
  }
  return { Success: true };
}

function readStringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function readStringArray(input: unknown, key: string): string[] {
  if (typeof input !== "object" || input === null) return [];
  const value = (input as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export default Plugin.define({
  id: "baba-lock-enforce",

  setup(ctx) {
    const directory = ctx.location.directory;
    const log = createDebug("baba-lock-enforce");

    void log.debug("plugin initialized", {
      directory,
      lockTtlMinutes: LOCK_TTL_MINUTES,
      writeTools: [...WRITE_TOOLS],
      readOnlyHost: isReadOnlyHost(),
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "acquire_lock",
        description:
          "Acquire a session file lock for a file. Locks live in .session-locks/ and are shared with " +
          "prompt-system/scripts/session-locks.ps1, so both surfaces see the same locks.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Absolute or repo-relative path to lock" },
            dependencies: {
              type: "array",
              items: { type: "string" },
              description: "Additional repo-relative paths this lock should cover.",
            },
          },
          required: ["filePath"],
        },
        async execute(input: unknown, context) {
          const sessionId = readStringField(context, "sessionID");
          if (!sessionId) return { output: "Error: session ID required" };
          if (isReadOnlyHost()) return { output: "Lock acquisition skipped: READ_ONLY host" };

          const filePath = readStringField(input, "filePath");
          if (!filePath) return { output: "Error: filePath required" };
          const dependencies = readStringArray(input, "dependencies");

          await log.debug("acquire_lock invoked", { session: sessionId, filePath, dependencies });
          const result = await acquireFileLock(directory, sessionId, filePath, dependencies);
          if (result.error) {
            await log.warn("acquire_lock failed", { session: sessionId, error: result.error });
            return { output: `Lock check failed: ${result.error}` };
          }
          if (result.Success) {
            await log.info("lock acquired", { session: sessionId, filePath, flatName: result.FlatName });
            return { output: `Lock acquired: ${filePath} (${result.FlatName})` };
          }

          const decision = result.Decision ? `\nOptions: ${result.Decision.join(", ")}` : "";
          await log.warn("acquire_lock blocked", { session: sessionId, filePath, owner: result.Owner });
          return {
            output:
              `Failed to acquire lock for ${filePath}` +
              `${result.Owner ? ` (held by ${result.Owner})` : ""}${decision}`,
          };
        },
      });

      editor.add({
        name: "release_lock",
        description: "Release a session file lock after editing is complete.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Absolute or repo-relative path to unlock" },
          },
          required: ["filePath"],
        },
        async execute(input: unknown) {
          if (isReadOnlyHost()) return { output: "Lock release skipped: READ_ONLY host" };
          const filePath = readStringField(input, "filePath");
          if (!filePath) return { output: "Error: filePath required" };

          await log.debug("release_lock invoked", { filePath });
          const result = await releaseFileLock(directory, filePath);
          if (result.Success) {
            await log.info("lock released", { filePath });
            return { output: `Lock released: ${filePath}` };
          }
          await log.warn("release_lock failed", { filePath, reason: result.Reason });
          return { output: `Failed to release lock: ${result.Reason}` };
        },
      });

      editor.add({
        name: "check_lock",
        description: "Report which live session, if any, holds a lock on a file.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Absolute or repo-relative path to check" },
          },
          required: ["filePath"],
        },
        async execute(input: unknown, context) {
          const sessionId = readStringField(context, "sessionID");
          if (!sessionId) return { output: "Error: session ID required" };
          if (isReadOnlyHost()) return { output: "Lock check skipped: READ_ONLY host" }

          const filePath = readStringField(input, "filePath");
          if (!filePath) return { output: "Error: filePath required" };

          await log.debug("check_lock invoked", { session: sessionId, filePath });
          const contention = await findContention(directory, sessionId, filePath);
          if (!contention) {
            await log.debug("check_lock: no live lock", { session: sessionId, filePath });
            return { output: `No live lock on ${filePath}` };
          }
          await log.debug("check_lock: lock found", { session: sessionId, filePath, owner: contention.owner });
          return { output: `${filePath} is locked by ${contention.owner} (${contention.lockPath})` };
        },
      });

      editor.add({
        name: "baba_lock_enforce_debug",
        description: "Debug baba-lock-enforce plugin: dump internal state or live locks.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "liveLocks", "config"],
              default: "state",
              description:
                "What to dump: state (all), liveLocks (current live locks), config (plugin config)",
            },
          },
        },
        async execute(input: unknown) {
          const action = readStringField(input, "action") ?? "state";
          if (action === "liveLocks") {
            const live = await readLiveLocks(directory);
            return {
              output: JSON.stringify(
                {
                  liveLocks: live.map((e) => ({
                    lockPath: e.lockPath,
                    owner: e.info.owner,
                    acquiredAt: e.info.acquiredAt,
                    dependencies: e.info.dependencies,
                  })),
                },
                null,
                2,
              ),
            };
          }
          if (action === "config") {
            return {
              output: JSON.stringify(
                {
                  lockTtlMinutes: LOCK_TTL_MINUTES,
                  writeTools: [...WRITE_TOOLS],
                  readOnlyHost: isReadOnlyHost(),
                },
                null,
                2,
              ),
            };
          }
          const live = await readLiveLocks(directory);
          await log.stateDump("baba-lock-enforce", {
            liveLocksCount: live.length,
            liveLocks: live.map((e) => ({
              lockPath: e.lockPath,
              owner: e.info.owner,
              acquiredAt: e.info.acquiredAt,
              dependencies: e.info.dependencies,
            })),
            config: {
              lockTtlMinutes: LOCK_TTL_MINUTES,
              writeTools: [...WRITE_TOOLS],
              readOnlyHost: isReadOnlyHost(),
            },
          });
          return { output: "State dumped to debug outputs (console, file, client.app.log)" };
        },
      });
    });

    void ctx.tool.hook("execute.before", async (event) => {
      if (!WRITE_TOOLS.has(event.tool)) return;
      if (isReadOnlyHost()) return;

      // The session id lives on the hook event. Reading it from the tool args
      // never works: write args are only { filePath }, so the hook never fired.
      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;

      const input = event.input;
      if (typeof input !== "object" || input === null) return;
      const args = input as { filePath?: unknown; path?: unknown };
      const filePath = typeof args.filePath === "string"
        ? args.filePath
        : typeof args.path === "string"
          ? args.path
          : undefined;
      if (!filePath) return;

      await log.debug("execute.before: checking contention", { session: sessionId, filePath, tool: event.tool });
      const contention = await findContention(directory, sessionId, filePath);

      if (!contention) return;

      const deps = contention.dependencies.length ? ` (covers ${contention.dependencies.join(", ")})` : "";
      await log.warn("lock contention detected, blocking write", {
        session: sessionId,
        filePath,
        owner: contention.owner,
        lockPath: contention.lockPath,
        dependencies: contention.dependencies,
      });
      throw new Error(
        `[LOCK CONTENTION] Write blocked: another live session holds "${filePath}".\n` +
          `Owner: ${contention.owner}${deps}\n` +
          `Lock: ${contention.lockPath}\n` +
          `This lock is never stolen automatically. Options:\n` +
          `  - wait for that session to finish and release its lock\n` +
          `  - coordinate and hand this edit to the other session\n` +
          `  - confirm the other session is idle, then remove the lock directory yourself`,
      );
    });
  },
});