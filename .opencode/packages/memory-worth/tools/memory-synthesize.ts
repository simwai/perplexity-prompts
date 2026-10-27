import { tool } from "@opencode-ai/plugin";
import { searchMemoriesFull } from "../db/queries.js";
import { resolveProjectId } from "../db/identity.js";
import { getToolDb } from "./get-db.js";

function queryTerms(query: string): string[] {
  const terms: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length > 2 && !terms.includes(raw)) terms.push(raw);
  }
  return terms;
}

export const memorySynthesizeTool = tool({
  description: "Answer a query from stored memories with citations plus an explicit unknowns list. scope: auto (default) searches current project + global; project searches only the current repo; global searches only shared memories; all searches everything.",
  args: {
    query: tool.schema.string().describe("Question to answer from memory"),
    scope: tool.schema.enum(["auto", "project", "global", "all"]).optional().describe("Search scope: auto (default), project, global, or all"),
  },
  async execute(args, context) {
    const query = args.query.trim();
    if (!query) return { output: JSON.stringify({ error: "query is required" }) };
    const db = await getToolDb(context.directory);
    const projectId = await resolveProjectId(context.directory);

    // Resolve scope to project list + boost
    let projects: string[] | undefined;
    let project_boost: number | undefined;

    if (args.scope === "all") {
      // no project filter
    } else if (args.scope === "global") {
      projects = ["global"];
    } else if (args.scope === "project") {
      projects = [projectId];
    } else {
      // auto: current project + global, current-first boost
      projects = [projectId, "global"];
      project_boost = 0.15;
    }

    const hits = await searchMemoriesFull(db, query, {
      projects,
      limit: 5,
      sessionId: context.sessionID,
      project_boost,
    });
    const cited: Array<{ id: number; content: string; mw: number }> = [];
    for (const hit of hits) {
      cited.push({ id: hit.id, content: hit.content, mw: hit.mw });
    }
    const covered = cited.map((item) => item.content.toLowerCase()).join("\n");
    const unknowns: string[] = [];
    for (const term of queryTerms(query)) {
      if (!covered.includes(term)) unknowns.push(term);
    }
    return { output: JSON.stringify({ cited, unknowns }) };
  },
});
