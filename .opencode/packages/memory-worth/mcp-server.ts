/**
 * memory-worth MCP server.
 *
 * Wraps the 12 legacy opencode tools behind the Model Context Protocol so any
 * MCP client (Claude Desktop, Cursor, opencode itself, etc.) can call them.
 *
 * Transport: stdio (line-delimited JSON-RPC), the standard MCP transport.
 * Run with: node mcp-server.js
 *
 * Configuration:
 *   MEMORY_WORTH_DIR   -- directory whose .opencode/memory.db is used. Defaults
 *                         to the current working directory.
 *   MEMORY_WORTH_SESSION -- optional session id passed to tools that need one
 *                         (search, outcome resolution). Defaults to unset.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createConnection } from "./db/connection.js";
import { runOneTimeImport } from "./db/queries.js";
import { MCP_TOOLS } from "./mcp-tools.js";

const server = new McpServer({
  name: "memory-worth",
  version: "0.1.0",
  instructions: `memory-worth MCP server. Persistent agent memory with trust scoring and project-scoped routing.

Usage:
- memory_search: call before answering when prior context could help. scope: auto (default) searches current project + global memories, ranked current-first.
- memory_write: store durable insights. applies_when is required. scope: auto routes to project unless the content is ungrounded and a convention/reference type.
- memory_wakeup: session-start digest. Returns the resolved session id and policy reminder.
- scope values: auto | project | global | all (search only). Use "global" for cross-project conventions; omit scope for project-local memories.

Configuration:
- MEMORY_WORTH_DB: explicit path to the SQLite file.
- MEMORY_WORTH_HOME: directory; DB is <home>/memory.db.
- Default: %LOCALAPPDATA%/memory-worth/memory.db (Windows) or XDG_DATA_HOME/memory-worth/memory.db.

All writes go to a single machine-level database. Projects are partitioned by the project column.`,
});

let db: Awaited<ReturnType<typeof createConnection>> | null = null;

async function ensureDb() {
  if (!db) {
    db = await createConnection();
    await runOneTimeImport(db, process.cwd());
  }
  return db;
}

server.registerTool(
  "memory_list_tools",
  {
    title: "List memory-worth tools",
    description: "List all memory-worth tools available through this MCP server.",
    inputSchema: {},
  },
  async () => {
    const tools = MCP_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputJsonSchema,
    }));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(tools, null, 2),
        },
      ],
    };
  }
);

for (const tool of MCP_TOOLS) {
  server.registerTool(
    tool.name,
    {
      title: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        await ensureDb();
        return await tool.execute(input);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(`memory-worth MCP server started (dir: ${DIRECTORY})\n`);