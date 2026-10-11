/**
 * Reading Protocol Plugin for opencode
 *
 * Enforces complete reading before analysis output:
 * - Computes dependency closure (depth 3) when a target file is read
 * - Tracks file read status in Reading Plan
 * - Blocks analysis output when Reading Plan is incomplete
 *
 * Hooks:
 *   1. session.created  -> initialize reading state
 *   2. tool.execute.after (read) -> track reads, lazily initialize plan,
 *                                   verify completion
 *   3. session.deleted  -> cleanup
 */

import { sessionIdFromEvent } from "../lib/baba-session-id";
import { createDebug } from "../lib/baba-debug";
import { tool } from "@opencode-ai/plugin";

interface ReadingPlanFile {
  path: string;
  status: "pending" | "complete" | "deferred";
}

interface ReadingPlan {
  scope: string;
  created_at: string;
  status:
    "in_progress" | "complete" | "partial-approved" | "skipped-greenfield";
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
    state = {
      sessionId,
      plan: null,
      blocked: false,
      lastUnreadFiles: [],
    };
    readingStates.set(sessionId, state);
  }
  return state;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function computeImportClosure(
  directory: string,
  targetPath: string,
  maxDepth: number,
  maxCalls: number,
  $: any,
): Promise<string[]> {
  const excludedDirs = [
    "node_modules",
    "vendor",
    "prompt-system",
    "dist",
    "build",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
  ];
  const sourceExts = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".rb",
    ".php",
  ];
  const testPatterns = [".test.", ".spec.", "test_"];
  const closure = new Set<string>();
  const visited = new Set<string>();
  const queue: { path: string; depth: number }[] = [
    { path: targetPath, depth: 0 },
  ];
  let calls = 0;

  const isExcluded = (p: string) =>
    excludedDirs.some((d) => p.includes(`/${d}/`) || p.includes(`\\${d}\\`));

  const isSource = (p: string) => sourceExts.some((ext) => p.endsWith(ext));
  const isTest = (p: string) => testPatterns.some((t) => p.includes(t));

  const addIfSource = (p: string) => {
    if (isSource(p) && !isExcluded(p)) {
      closure.add(p);
    }
  };

  const resolveImport = (base: string, rawImport: string): string | null => {
    const trimmed = rawImport.replace(/['";]/g, "").trim();
    if (!trimmed || trimmed.startsWith(".") === false) return null;
    const baseDir = base.substring(
      0,
      base.lastIndexOf("/") >= 0
        ? base.lastIndexOf("/")
        : base.lastIndexOf("\\"),
    );
    const resolved = `${baseDir}/${trimmed}`;
    const withExt = sourceExts.find((ext) => resolved.endsWith(ext))
      ? resolved
      : `${resolved}.ts`;
    return withExt;
  };

  while (queue.length > 0 && calls < maxCalls) {
    const { path: current, depth } = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    addIfSource(current);
    if (depth >= maxDepth) continue;

    const absolutePath = `${directory}/${current}`;
    let content: string;
    try {
      content = await $`cat ${absolutePath}`.text();
    } catch {
      continue;
    }
    calls++;

    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null && calls < maxCalls) {
      const resolved = resolveImport(current, match[1]);
      if (resolved && !visited.has(resolved)) {
        queue.push({ path: resolved, depth: depth + 1 });
      }
    }

    const fileName = current.substring(
      current.lastIndexOf("/") >= 0
        ? current.lastIndexOf("/") + 1
        : current.length,
    );
    try {
      const out =
        await $`rg --no-heading --line-number "import\\s+.*?${escapeRegex(fileName)}" ${directory}`.text();
      const lines = out.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        const rp = line.split(":")[0];
        if (!visited.has(rp) && isSource(rp)) {
          queue.push({ path: rp, depth: depth + 1 });
        }
      }
    } catch {
      // reverse lookup unavailable; continue without it
    }
    calls++;
  }

  for (const file of closure) {
    const base = file.replace(`${directory}/`, "");
    const baseName = base.endsWith(".ts") ? base.slice(0, -".ts".length) : base;
    const testFiles = sourceExts.flatMap((ext) => {
      const name = base.endsWith(ext) ? base.slice(0, -ext.length) : base;
      return [name + ".test" + ext, name + ".spec" + ext, "test_" + name + ext];
    });
    for (const tf of testFiles) {
      const testPath = `${directory}/${tf}`;
      try {
        await $`cat ${testPath}`.text();
        closure.add(tf);
      } catch {
        // test file does not exist, skip
      }
    }
  }

  return Array.from(closure);
}

export default async ({
  client,
  $,
  project,
  directory,
  worktree,
}: {
  client: any;
  $: any;
  project: any;
  directory: string;
  worktree: string;
}) => {
  const log = createDebug("baba-reading-protocol", client);

  await log.debug("plugin initialized", { directory, maxDepth: 3, maxCalls: 30 });

  return {
    tool: {
      baba_reading_protocol_debug: tool({
        description: "Debug baba-reading-protocol plugin: dump internal state.",
        args: {
          action: tool.schema
            .enum(["state", "sessions", "plans"])
            .default("state")
            .describe("What to dump: state (all), sessions (reading states per session), plans (reading plans per session)"),
        },
        async execute(args) {
          const action = args.action ?? "state";
          switch (action) {
            case "sessions": {
              const sessions: Record<string, ReadingState> = {};
              for (const [id, state] of readingStates.entries()) {
                sessions[id] = {
                  sessionId: state.sessionId,
                  plan: state.plan ? {
                    scope: state.plan.scope,
                    created_at: state.plan.created_at,
                    status: state.plan.status,
                    files: state.plan.files,
                  } : null,
                  blocked: state.blocked,
                  lastUnreadFiles: state.lastUnreadFiles,
                };
              }
              return JSON.stringify(sessions, null, 2);
            }
            case "plans": {
              const plans: Record<string, ReadingPlan | null> = {};
              for (const [id, state] of readingStates.entries()) {
                plans[id] = state.plan;
              }
              return JSON.stringify(plans, null, 2);
            }
            case "state":
            default: {
              await log.stateDump("baba-reading-protocol", {
                sessionCount: readingStates.size,
                sessions: Object.fromEntries(
                  Array.from(readingStates.entries()).map(([id, state]) => [
                    id,
                    {
                      sessionId: state.sessionId,
                      plan: state.plan ? {
                        scope: state.plan.scope,
                        created_at: state.plan.created_at,
                        status: state.plan.status,
                        files: state.plan.files,
                      } : null,
                      blocked: state.blocked,
                      lastUnreadFiles: state.lastUnreadFiles,
                    },
                  ])
                ),
              });
              return "State dumped to debug outputs (console, file, client.app.log)";
            }
          }
        },
      }),
    },

    event: async ({ event }: { event: any }) => {
      const sessionId = sessionIdFromEvent(event.properties);
      if (!sessionId) return;

      const state = getOrCreateState(sessionId);

      if (event.type === "session.created") {
        state.plan = null;
        state.blocked = false;
        state.lastUnreadFiles = [];
        await log.info("session created", { session: sessionId });
        return;
      }

      if (event.type === "session.deleted") {
        await log.debug("session deleted, cleaning up", { session: sessionId });
        readingStates.delete(sessionId);
        return;
      }
    },

    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: any,
    ) => {
      const sessionId = input.sessionID;
      if (!sessionId || input.tool !== "read") return;

      const state = getOrCreateState(sessionId);
      const readPath = input.args?.filePath;
      if (!readPath) return;

      // Lazily initialize plan on first read using the read file as target
      if (!state.plan) {
        const relativeTarget = readPath.startsWith(directory)
          ? readPath.substring(directory.length + 1)
          : readPath;
        const files = await computeImportClosure(
          directory,
          relativeTarget,
          3,
          30,
          $,
        );
        state.plan = {
          scope: relativeTarget,
          created_at: new Date().toISOString(),
          status: "in_progress",
          files: files.map((f) => ({ path: f, status: "pending" })),
        };
        await log.info("reading plan created", { session: sessionId, target: relativeTarget, fileCount: files.length });
      }

      // Mark file as complete
      if (state.plan) {
        const fileEntry = state.plan.files.find((f) => f.path === readPath);
        if (fileEntry && fileEntry.status === "pending") {
          fileEntry.status = "complete";
          await log.debug("file marked complete", { session: sessionId, file: readPath, completedCount: state.plan.files.filter(f => f.status === "complete").length, totalCount: state.plan.files.length });
        }
      }

      if (
        state.plan &&
        state.plan.files.every((f) => f.status === "complete")
      ) {
        state.plan.status = "complete";
        state.blocked = false;
        state.lastUnreadFiles = [];
        await log.info("reading plan complete", { session: sessionId, scope: state.plan.scope });
      }
    },
  };
};
