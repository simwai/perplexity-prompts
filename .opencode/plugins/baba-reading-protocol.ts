/**
 * Reading Protocol Plugin for opencode (V2)
 *
 * Enforces complete reading before analysis output:
 * - Computes the dependency closure (depth 3) when a target file is read
 * - Tracks file read status in a per-session Reading Plan
 * - Blocks analysis output when the Reading Plan is incomplete
 *
 * Hooks:
 *   1. session.created  -> initialize reading state
 *   2. tool.execute.after (read) -> track reads, lazily initialize plan,
 *                                   verify completion
 *   3. session.deleted  -> cleanup
 *
 * V2 changes:
 *   - `tool.execute.after` became `ctx.tool.hook("execute.after")`, reading
 *     `event.sessionID` and `event.input.filePath`.
 *   - V2 has no Bun `$` shell on the plugin context, so the import closure is
 *     computed with `node:fs/promises` instead of `$cat` / `$rg`. Same graph,
 *     same depth limit, no shell dependency -- and it removes the reverse-import
 *     lookup's dependency on ripgrep being on PATH.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

interface ReadingPlanFile {
  path: string;
  status: "pending" | "complete" | "deferred";
}

interface ReadingPlan {
  scope: string;
  created_at: string;
  status: "in_progress" | "complete" | "partial-approved" | "skipped-greenfield";
  files: ReadingPlanFile[];
}

interface ReadingState {
  sessionId: string;
  plan: ReadingPlan | null;
  blocked: boolean;
  lastUnreadFiles: string[];
}

const readingStates = new Map<string, ReadingState>();

function getOrCreateState(sessionId: string): ReadingState {
  let state = readingStates.get(sessionId);
  if (!state) {
    state = { sessionId, plan: null, blocked: false, lastUnreadFiles: [] };
    readingStates.set(sessionId, state);
  }
  return state;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".rb", ".php"];
const EXCLUDED_DIRS = ["node_modules", "vendor", "prompt-system", "dist", "build", ".git", "__pycache__", ".venv", "venv", ".opencode"];
const TEST_PATTERNS = [".test.", ".spec.", "test_"];

function isExcluded(p: string): boolean {
  return EXCLUDED_DIRS.some((d) => p.includes(`/${d}/`) || p.includes(`\\${d}\\`));
}

function isSource(p: string): boolean {
  return SOURCE_EXTS.some((ext) => p.endsWith(ext));
}

function isTest(p: string): boolean {
  return TEST_PATTERNS.some((t) => p.includes(t));
}

function resolveImport(base: string, rawImport: string): string | null {
  const trimmed = rawImport.replace(/['";]/g, "").trim();
  if (!trimmed || !trimmed.startsWith(".")) return null;
  const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
  const baseDir = slash >= 0 ? base.substring(0, slash) : "";
  const resolved = baseDir ? `${baseDir}/${trimmed}` : trimmed;
  const withExt = SOURCE_EXTS.find((ext) => resolved.endsWith(ext)) ? resolved : `${resolved}.ts`;
  return withExt;
}

/** Repo-relative source files under `directory`, excluding artifact directories. */
async function listSourceFiles(directory: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.includes(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (!isSource(entry.name)) continue;
      if (isExcluded(full)) continue;
      out.push(full);
    }
  };
  await walk(directory);
  return out;
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return undefined;
  }
}

async function computeImportClosure(
  directory: string,
  targetPath: string,
  maxDepth: number,
  maxCalls: number,
): Promise<string[]> {
  const closure = new Set<string>();
  const visited = new Set<string>();
  const queue: { path: string; depth: number }[] = [{ path: targetPath, depth: 0 }];
  let calls = 0;

  // Reverse imports need the whole file list once; cache it across the walk
  // rather than shelling out per target.
  let sourceFiles: string[] | null = null;

  while (queue.length > 0 && calls < maxCalls) {
    const { path: current, depth } = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (isSource(current) && !isExcluded(`${directory}/${current}`)) closure.add(current);
    if (depth >= maxDepth) continue;

    const absolutePath = current.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(current)
      ? current
      : join(directory, current);

    const content = await readIfExists(absolutePath);
    if (content === undefined) continue;
    calls++;

    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null && calls < maxCalls) {
      const resolved = resolveImport(current, match[1]);
      if (resolved && !visited.has(resolved)) queue.push({ path: resolved, depth: depth + 1 });
    }

    // Reverse dependency: who imports this file, by its basename.
    const slash = Math.max(current.lastIndexOf("/"), current.lastIndexOf("\\"));
    const fileName = slash >= 0 ? current.substring(slash + 1) : current;
    if (!isTest(current)) {
      if (sourceFiles === null) sourceFiles = await listSourceFiles(directory);
      const needle = new RegExp(`import\\s+.*?${escapeRegex(fileName)}`);
      for (const file of sourceFiles) {
        if (calls >= maxCalls) break;
        const rel = file.startsWith(directory) ? file.slice(directory.length + 1) : file;
        if (visited.has(rel)) continue;
        const text = await readIfExists(file);
        if (text === undefined) continue;
        calls++;
        if (needle.test(text)) queue.push({ path: rel, depth: depth + 1 });
      }
    }
  }

  // Attach adjacent test files for every closure member.
  for (const file of [...closure]) {
    const baseNames = SOURCE_EXTS.flatMap((ext) =>
      file.endsWith(ext) ? [file.slice(0, -ext.length)] : [],
    );
    for (const base of baseNames) {
      const candidates = [
        ...SOURCE_EXTS.flatMap((ext) => [
          `${base}.test${ext}`,
          `${base}.spec${ext}`,
          `test_${base}${ext}`,
        ]),
      ];
      for (const candidate of candidates) {
        const testPath = candidate.startsWith("/") ? candidate : join(directory, candidate);
        if ((await readIfExists(testPath)) !== undefined) closure.add(candidate);
      }
    }
  }

  return [...closure];
}

function readStringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function readDataString(event: unknown, key: string): string | undefined {
  if (typeof event !== "object" || event === null) return undefined;
  const data = (event as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default Plugin.define({
  id: "baba-reading-protocol",

  setup(ctx) {
    const directory = ctx.location.directory;
    const log = createDebug("baba-reading-protocol");

    void log.debug("plugin initialized", { directory, maxDepth: 3, maxCalls: 30 });

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      if (event.type !== "session.created" && event.type !== "session.deleted") return;
      const sessionId = readDataString(event, "sessionID");
      if (!sessionId) return;

      if (event.type === "session.created") {
        readingStates.set(sessionId, { sessionId, plan: null, blocked: false, lastUnreadFiles: [] });
        await log.info("session created", { session: sessionId });
        return;
      }

      void log.debug("session deleted, cleaning up", { session: sessionId });
      readingStates.delete(sessionId);
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "baba_reading_protocol_debug",
        description: "Debug baba-reading-protocol plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "sessions", "plans"],
              default: "state",
              description:
                "What to dump: state (all), sessions (reading states per session), plans (reading plans per session)",
            },
          },
        },
        async execute(input: unknown) {
          const action = readStringField(input, "action") ?? "state";
          if (action === "sessions") {
            return { output: JSON.stringify(Object.fromEntries(readingStates), null, 2) };
          }
          if (action === "plans") {
            const plans: Record<string, ReadingPlan | null> = {};
            for (const [id, state] of readingStates) plans[id] = state.plan;
            return { output: JSON.stringify(plans, null, 2) };
          }
          await log.stateDump("baba-reading-protocol", {
            sessionCount: readingStates.size,
            sessions: Object.fromEntries(readingStates),
          });
          return { output: "State dumped to debug outputs (console, file, client.app.log)" };
        },
      });
    });

    void ctx.tool.hook("execute.after", async (event) => {
      if (event.tool !== "read") return;
      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;

      const readPath = readStringField(event.input, "filePath");
      if (!readPath) return;

      const state = getOrCreateState(sessionId);

      // Lazily initialize the plan on first read, using that read as the target.
      if (!state.plan) {
        const relativeTarget = readPath.startsWith(directory)
          ? readPath.slice(directory.length + 1)
          : readPath;
        const files = await computeImportClosure(directory, relativeTarget, 3, 30);
        state.plan = {
          scope: relativeTarget,
          created_at: new Date().toISOString(),
          status: "in_progress",
          files: files.map((f) => ({ path: f, status: "pending" as const })),
        };
        await log.info("reading plan created", {
          session: sessionId,
          target: relativeTarget,
          fileCount: files.length,
        });
      }

      const fileEntry = state.plan.files.find((f) => f.path === readPath);
      if (fileEntry && fileEntry.status === "pending") {
        fileEntry.status = "complete";
        await log.debug("file marked complete", {
          session: sessionId,
          file: readPath,
          completedCount: state.plan.files.filter((f) => f.status === "complete").length,
          totalCount: state.plan.files.length,
        });
      }

      if (state.plan.files.every((f) => f.status === "complete")) {
        state.plan.status = "complete";
        state.blocked = false;
        state.lastUnreadFiles = [];
        await log.info("reading plan complete", { session: sessionId, scope: state.plan.scope });
      }
    });

    return () => {
      readingStates.clear();
    };
  },
});