import { tool } from "@opencode-ai/plugin";
import { findDuplicateFull, writeMemoryFull } from "../db/queries.js";
import { resolveProjectId } from "../db/identity.js";
import { getToolDb } from "./get-db.js";
import { join, sep } from "node:path";

const groundSchema = tool.schema.object({
  kind: tool.schema.string().describe("Ground kind: file, symbol, or git_ref"),
  value: tool.schema.string().describe("Ground value"),
  fingerprint: tool.schema.string().optional().describe("Content fingerprint"),
});

/** Repo-scoped tokens that indicate a memory belongs to the current project. */
const REPO_TOKENS = [sep, "/", "\\", ".ts", ".js", ".py", ".go", ".rs", ".java", ".cs", ".json", ".md", ".yaml", ".yml", ".toml"];

function hasRepoToken(content: string, projectId: string): boolean {
  const lower = content.toLowerCase();
  for (const token of REPO_TOKENS) {
    if (lower.includes(token.toLowerCase())) return true;
  }
  if (projectId && lower.includes(projectId.toLowerCase())) return true;
  return false;
}

const GLOBAL_TYPES = new Set(["convention", "reference"]);

export const memoryWriteTool = tool({
  description: "Store a piece of knowledge in persistent memory. Requires applies_when. Refuses exact duplicates. scope: auto (default) routes project-local content to the current repo; ungrounded convention/reference memories route to the shared global scope.",
  args: {
    content: tool.schema.string().describe("The knowledge to store"),
    applies_when: tool.schema.string().describe("When this memory applies (required)"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("Tags"),
    task_type: tool.schema.string().optional().describe("Task type bucket (default general)"),
    scope: tool.schema.enum(["auto", "project", "global"]).optional().describe("Write scope: auto (default), project, or global"),
    tier: tool.schema.enum(["L1", "L2", "L3"]).optional().describe("Tier (default L1)"),
    memory_type: tool.schema.enum(["convention", "decision", "bugfix", "error", "reference", "note"]).optional().describe("Memory type"),
    source: tool.schema.enum(["session", "file", "tool", "user", "agent"]).optional().describe("Source"),
    grounds: tool.schema.array(groundSchema).optional().describe("Grounds: file, symbol, or git_ref references"),
  },
  async execute(args, context) {
    const db = await getToolDb(context.directory);
    const projectId = await resolveProjectId(context.directory);

    // Duplicate check (project-aware)
    const duplicate = await findDuplicateFull(db, args.content);
    if (duplicate !== null) {
      return { output: JSON.stringify({ duplicate_of: duplicate, project: projectId, routing: "duplicate", reason: "exact content match already stored" }) };
    }

    // Auto-routing decision
    let scope = args.scope ?? "auto";
    let project: string;
    let reason: string;

    if (scope === "global") {
      project = "global";
      reason = "explicit global scope";
    } else if (scope === "project") {
      project = projectId;
      reason = "explicit project scope";
    } else {
      // auto: route to project unless ungrounded and a shareable type
      const hasGrounds = args.grounds && args.grounds.length > 0;
      const hasToken = hasRepoToken(args.content, projectId);
      const isShareableType = args.memory_type && GLOBAL_TYPES.has(args.memory_type);

      if (!hasGrounds && !hasToken && isShareableType) {
        project = "global";
        reason = "ungrounded convention/reference memory routed to global scope";
      } else {
        project = projectId;
        reason = hasGrounds ? "grounded memory routed to project scope"
          : hasToken ? "repo-scoped token detected, routed to project scope"
          : "default project scope";
      }
    }

    // Derive topic from scope if project/topic format was given (legacy string scope)
    let topic: string | undefined;
    if (typeof args.scope === "string") {
      const slash = args.scope.indexOf("/");
      if (slash > 0 && slash < args.scope.length - 1) {
        topic = args.scope.slice(slash + 1);
      }
    }

    try {
      const stored = await writeMemoryFull(db, {
        content: args.content,
        applies_when: args.applies_when,
        tags: args.tags,
        grounds: args.grounds,
        taskType: args.task_type,
        memoryType: args.memory_type,
        tier: args.tier,
        source: args.source,
        project,
        topic,
      });
      return { output: JSON.stringify({ id: stored.id, project, routing: scope, reason, duplicate_of: null }) };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "write failed";
      return { output: JSON.stringify({ error: message }) };
    }
  },
});
