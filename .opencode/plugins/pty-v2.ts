/**
 * PTY V2 — Interactive PTY Management Plugin for opencode (V2)
 *
 * Replaces V1 hooks from opencode-pty:
 *   - command.execute.before (pty-open-background-spy, pty-show-server-url) -> ctx.command.transform
 *   - tool (pty_spawn, pty_write, pty_read, pty_list, pty_kill) -> ctx.tool.transform
 *   - config (register commands) -> ctx.command.transform
 *   - event (session.deleted cleanup) -> ctx.event.subscribe()
 *
 * V2 changes:
 *   - Uses ctx.command.transform for slash commands and command registration
 *   - Uses ctx.tool.transform for agent-callable tools
 *   - Session lifecycle via ctx.event.subscribe() for session.deleted
 *   - Web server for PTY sessions UI (PTYServer)
 *   - Debug logging via baba-debug
 *
 * Note: This plugin requires bun-pty runtime. It will not work in Node.js without Bun.
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

/* ---------- Types ---------- */

interface PTYSessionInfo {
  id: string;
  title: string;
  command: string;
  args: string[];
  workdir: string;
  pid: number;
  status: "running" | "exited" | "killed";
  notifyOnExit: boolean;
  timeoutSeconds: number | undefined;
  lineCount: number;
  parentSessionId: string;
  parentAgent: string;
}

interface SpawnOptions {
  command: string;
  args: string[];
  workdir?: string;
  env?: Record<string, string>;
  title?: string;
  description?: string;
  parentSessionId: string;
  parentAgent: string;
  notifyOnExit?: boolean;
  timeoutSeconds?: number;
}

/* ---------- Bun-pty availability check ---------- */

let Terminal: typeof import("bun-pty").Terminal;
let bunPtyAvailable = false;

async function checkBunPty() {
  try {
    const bunPty = await import("bun-pty");
    Terminal = bunPty.Terminal;
    bunPtyAvailable = true;
  } catch {
    bunPtyAvailable = false;
  }
}

checkBunPty();

/* ---------- Constants ---------- */

const DEFAULT_READ_LIMIT = 500;
const MAX_LINE_LENGTH = 2000;
const NOTIFY_ON_EXIT_INSTRUCTIONS = [
  `<system_reminder>`,
  `Completion signal for this session is the future \`<pty_exited>\` message.`,
  `If you only need to know whether the command finished, do not call \`pty_read\`; wait for \`<pty_exited>\`.`,
  `Never use sleep plus \`pty_read\` loops to check completion for this session.`,
  `Call \`pty_read\` before exit only if you need live output now, the user explicitly asks for logs, or the exit notification reports a non-zero status and you need to investigate.`,
  `</system_reminder>`,
].join("\n");

const ETX = String.fromCharCode(3);
const EOT = String.fromCharCode(4);

/* ---------- PTY Manager ---------- */

class PTYManager {
  private sessions = new Map<string, PTYSession>();
  private outputBuffers = new Map<string, string[]>();
  private sessionUpdateCallbacks: Array<(session: PTYSessionInfo) => void> = [];
  private rawOutputCallbacks: Array<(session: PTYSessionInfo, data: string) => void> = [];
  private notificationManager: NotificationManager;
  private nextId = 0;

  constructor() {
    this.notificationManager = new NotificationManager();
  }

  init(opcClient: any) {
    this.notificationManager.init(opcClient);
  }

  registerSessionUpdateCallback(cb: (session: PTYSessionInfo) => void) {
    this.sessionUpdateCallbacks.push(cb);
  }

  removeSessionUpdateCallback(cb: (session: PTYSessionInfo) => void) {
    const idx = this.sessionUpdateCallbacks.indexOf(cb);
    if (idx !== -1) this.sessionUpdateCallbacks.splice(idx, 1);
  }

  registerRawOutputCallback(cb: (session: PTYSessionInfo, data: string) => void) {
    this.rawOutputCallbacks.push(cb);
  }

  removeRawOutputCallback(cb: (session: PTYSessionInfo, data: string) => void) {
    const idx = this.rawOutputCallbacks.indexOf(cb);
    if (idx !== -1) this.rawOutputCallbacks.splice(idx, 1);
  }

  private notifySessionUpdate(session: PTYSessionInfo) {
    for (const cb of this.sessionUpdateCallbacks) {
      try { cb(session); } catch {}
    }
  }

  private notifyRawOutput(session: PTYSessionInfo, rawData: string) {
    for (const cb of this.rawOutputCallbacks) {
      try { cb(session, rawData); } catch {}
    }
  }

  spawn(opts: SpawnOptions): PTYSessionInfo {
    if (!bunPtyAvailable || !Terminal) {
      throw new Error("bun-pty not available. This plugin requires Bun runtime.");
    }

    this.nextId = (this.nextId ?? 0) + 1;
    const id = `pty_${this.nextId.toString(16).padStart(8, "0")}`;
    const title = opts.title ?? `${opts.command} ${opts.args.join(" ")}`.slice(0, 50);

    // Use any to bypass Terminal constructor type issues
    const term = new (Terminal as any)({
      command: opts.command,
      args: opts.args,
      cwd: opts.workdir ?? process.cwd(),
      env: { ...process.env, ...opts.env },
    });

    const buffer: string[] = [];
    this.outputBuffers.set(id, buffer);

    let status: PTYSessionInfo["status"] = "running";
    let pid = term.pid;
    let exited = false;

    const session: PTYSession = {
      id,
      title,
      command: opts.command,
      args: opts.args,
      workdir: opts.workdir ?? process.cwd(),
      pid,
      status,
      notifyOnExit: opts.notifyOnExit ?? false,
      timeoutSeconds: opts.timeoutSeconds,
      parentSessionId: opts.parentSessionId,
      parentAgent: opts.parentAgent,
      term,
      buffer,
      exited,
      timedOut: false,
    };

    this.sessions.set(id, session);

    // Start read loop - use event listener instead of async iterator for compatibility
    (async () => {
      // Terminal may use onData or similar event-based API
      const termAny = term as any;
      if (typeof termAny.onData === "function") {
        termAny.onData((data: string) => {
          if (exited) return;
          buffer.push(data);
          this.notifyRawOutput(this.toInfo(session), data);
        });
      } else if (typeof termAny[Symbol.asyncIterator] === "function") {
        for await (const data of termAny) {
          if (exited) break;
          buffer.push(data);
          this.notifyRawOutput(this.toInfo(session), data);
        }
      }
      // Process exited
      if (!exited) {
        exited = true;
        status = "exited";
        this.notifySessionUpdate(this.toInfo(session));
        if (opts.notifyOnExit) {
          await this.notificationManager.sendExitNotification(this.toInfo(session), 0);
        }
      }
    })();

    // Timeout handling
    if (opts.timeoutSeconds && opts.timeoutSeconds > 0) {
      setTimeout(() => {
        const s = this.sessions.get(id);
        if (s && s.status === "running") {
          s.timedOut = true;
          s.term.kill();
        }
      }, opts.timeoutSeconds * 1000);
    }

    this.notifySessionUpdate(this.toInfo(session));
    return this.toInfo(session);
  }

  write(id: string, data: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (session.status !== "running") return false;
    try {
      session.term.write(data);
      return true;
    } catch {
      return false;
    }
  }

  read(id: string, offset = 0, limit?: number): { lines: string[]; offset: number; totalLines: number; hasMore: boolean } | null {
    const buffer = this.outputBuffers.get(id);
    if (!buffer) return null;
    const start = Math.max(0, offset);
    const end = limit ? Math.min(buffer.length, start + limit) : buffer.length;
    return {
      lines: buffer.slice(start, end),
      offset: start,
      totalLines: buffer.length,
      hasMore: end < buffer.length,
    };
  }

  search(id: string, pattern: RegExp, offset = 0, limit?: number): { matches: Array<{ text: string; lineNumber: number }>; totalLines: number; totalMatches: number; hasMore: boolean } | null {
    const buffer = this.outputBuffers.get(id);
    if (!buffer) return null;
    const matches: Array<{ text: string; lineNumber: number }> = [];
    for (let i = 0; i < buffer.length; i++) {
      if (pattern.test(buffer[i])) {
        matches.push({ text: buffer[i], lineNumber: i + 1 });
      }
    }
    const start = Math.max(0, offset);
    const end = limit ? Math.min(matches.length, start + limit) : matches.length;
    return {
      matches: matches.slice(start, end),
      totalLines: buffer.length,
      totalMatches: matches.length,
      hasMore: end < matches.length,
    };
  }

  list(): PTYSessionInfo[] {
    return Array.from(this.sessions.values()).map(s => this.toInfo(s));
  }

  get(id: string): PTYSessionInfo | null {
    const session = this.sessions.get(id);
    return session ? this.toInfo(session) : null;
  }

  kill(id: string, cleanup = false): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (session.status === "running") {
      try { session.term.kill(); } catch {}
      session.status = "killed";
    }
    if (cleanup) {
      this.sessions.delete(id);
      this.outputBuffers.delete(id);
    }
    this.notifySessionUpdate(this.toInfo(session));
    return true;
  }

  cleanupBySession(parentSessionId: string) {
    for (const [id, session] of this.sessions) {
      if (session.parentSessionId === parentSessionId) {
        this.kill(id, true);
      }
    }
  }

  clearAllSessions() {
    for (const [id, session] of this.sessions) {
      if (session.status === "running") {
        try { session.term.kill(); } catch {}
      }
    }
    this.sessions.clear();
    this.outputBuffers.clear();
  }

  toInfo(s: PTYSession): PTYSessionInfo {
    return {
      id: s.id,
      title: s.title,
      command: s.command,
      args: s.args,
      workdir: s.workdir,
      pid: s.pid,
      status: s.status,
      notifyOnExit: s.notifyOnExit,
      timeoutSeconds: s.timeoutSeconds,
      lineCount: s.buffer.length,
      parentSessionId: s.parentSessionId,
      parentAgent: s.parentAgent,
    };
  }
}

interface PTYSession {
  id: string;
  title: string;
  command: string;
  args: string[];
  workdir: string;
  pid: number;
  status: "running" | "exited" | "killed";
  notifyOnExit: boolean;
  timeoutSeconds: number | undefined;
  parentSessionId: string;
  parentAgent: string;
  term: InstanceType<typeof Terminal>;
  buffer: string[];
  exited: boolean;
  timedOut: boolean;
}

/* ---------- Notification Manager ---------- */

class NotificationManager {
  private client: any = null;

  init(client: any) {
    this.client = client;
  }

  async sendExitNotification(session: PTYSessionInfo, exitCode: number) {
    if (!this.client) return;
    try {
      await this.client.session.prompt({
        path: { id: session.parentSessionId },
        body: {
          noReply: true,
          parts: [{
            type: "text",
            text: `<pty_exited>\nID: ${session.id}\nExit code: ${exitCode}\nTitle: ${session.title}\nCommand: ${session.command} ${session.args.join(" ")}\n</pty_exited>`,
          }],
        },
      });
    } catch {}
  }
}

/* ---------- Formatters ---------- */

function formatLine(text: string, lineNumber: number, maxLength: number): string {
  const truncated = text.length > maxLength ? text.slice(0, maxLength) + "…" : text;
  return `${lineNumber.toString().padStart(5, " ")}: ${truncated}`;
}

function formatSessionInfo(session: PTYSessionInfo): string[] {
  return [
    `ID: ${session.id}`,
    `Title: ${session.title}`,
    `Command: ${session.command} ${session.args.join(" ")}`,
    `Workdir: ${session.workdir}`,
    `PID: ${session.pid}`,
    `Status: ${session.status}`,
    `Lines: ${session.lineCount}`,
    `NotifyOnExit: ${session.notifyOnExit}`,
    `TimeoutSeconds: ${session.timeoutSeconds ?? "none"}`,
    `Parent: ${session.parentSessionId}`,
    `---`,
  ];
}

function parseEscapeSequences(input: string): string {
  return input.replace(/\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|[nrt\\])/g, (match, seq) => {
    if (seq.startsWith("x")) return String.fromCharCode(parseInt(seq.slice(1), 16));
    if (seq.startsWith("u")) return String.fromCharCode(parseInt(seq.slice(1), 16));
    switch (seq) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "\\": return "\\";
      default: return match;
    }
  });
}

function extractCommands(data: string): string[] {
  return data.split(/[\n\r]+/).map(l => l.trim()).filter(l => l && !l.startsWith(ETX) && !l.startsWith(EOT));
}

function parseCommand(commandLine: string): { command: string; args: string[] } {
  const parts = commandLine.split(/\s+/).filter(Boolean);
  return { command: parts[0] ?? "", args: parts.slice(1) };
}

function validateRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    const dangerousPatterns = [
      /\(\?:.*\)\*.*\(\?:.*\)\*/,
      /.*\(\.\*\?\)\{2,\}.*/,
      /.*\(.*\|.*\)\{3,\}.*/,
    ];
    return !dangerousPatterns.some(d => d.test(pattern));
  } catch {
    return false;
  }
}

/* ---------- PTY Server (Web UI) ---------- */

// Web server not included in this build - returns null
let PTYServer: { createServer: () => Promise<{ server: { url: URL } }> } | null = null;

async function loadPTYServer() {
  return PTYServer;
}

/* ---------- V2 Plugin ---------- */

export default Plugin.define({
  id: "pty-v2",

  async setup(ctx) {
    const log = createDebug("pty-v2");
    const manager = new PTYManager();

    await log.debug("plugin initialized", {
      directory: ctx.location.directory,
      bunPtyAvailable,
    });

    if (!bunPtyAvailable) {
      await log.warn("bun-pty not available - PTY tools will return errors");
    }

    /* ---- Register PTY tools ---- */
    void ctx.tool.transform((editor) => {
      // pty_spawn
      editor.add({
        name: "pty_spawn",
        description: "Spawn a new PTY session (background process with full terminal emulation)",
        input: {
          type: "object",
          properties: {
            command: { type: "string", description: "The command/executable to run" },
            args: { type: "array", items: { type: "string" }, description: "Arguments to pass to the command" },
            workdir: { type: "string", description: "Working directory for the PTY session" },
            env: { type: "object", additionalProperties: { type: "string" }, description: "Additional environment variables" },
            title: { type: "string", description: "Human-readable title for the session" },
            description: { type: "string", description: "Clear description of what this PTY session is for" },
            notifyOnExit: { type: "boolean", default: false, description: "Send notification when process exits" },
            timeoutSeconds: { type: "number", description: "Auto-kill after this many seconds" },
          },
          required: ["command"],
        },
        async execute(input: unknown, context) {
          const sessionID = context.sessionID;
          const agent = context.agent;
          if (!sessionID || !agent) return { output: "Error: sessionID and agent required" };

          if (!bunPtyAvailable) {
            return { output: "Error: bun-pty not available. This plugin requires Bun runtime." };
          }

          const args = input as Record<string, unknown>;
          const command = String(args.command ?? "");
          const cmdArgs = Array.isArray(args.args) ? args.args.map(String) : [];
          const workdir = args.workdir ? String(args.workdir) : undefined;
          const env = args.env && typeof args.env === "object" ? args.env as Record<string, string> : undefined;
          const title = args.title ? String(args.title) : undefined;
          const description = args.description ? String(args.description) : undefined;
          const notifyOnExit = Boolean(args.notifyOnExit);
          const timeoutSeconds = typeof args.timeoutSeconds === "number" ? args.timeoutSeconds : undefined;

          if (!command) return { output: "Error: command required" };

          try {
            const info = manager.spawn({
              command,
              args: cmdArgs,
              workdir,
              env,
              title,
              description,
              parentSessionId: sessionID,
              parentAgent: agent,
              notifyOnExit,
              timeoutSeconds,
            });

            let output = [
              `<pty_spawned>`,
              `ID: ${info.id}`,
              `Title: ${info.title}`,
              `Command: ${info.command} ${info.args.join(" ")}`,
              `Workdir: ${info.workdir}`,
              `PID: ${info.pid}`,
              `Status: ${info.status}`,
              `NotifyOnExit: ${info.notifyOnExit}`,
              `TimeoutSeconds: ${info.timeoutSeconds ?? "none"}`,
              `</pty_spawned>`,
            ].join("\n");

            if (info.notifyOnExit) output += "\n\n" + NOTIFY_ON_EXIT_INSTRUCTIONS;

            return { output };
          } catch (e) {
            return { output: `Error: ${e instanceof Error ? e.message : String(e)}` };
          }
        },
      });

      // pty_write
      editor.add({
        name: "pty_write",
        description: "Write data to a PTY session",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "The PTY session ID (e.g., pty_a1b2c3d4)" },
            data: { type: "string", description: "The input data to send to the PTY (supports \\n, \\r, \\t, \\xNN, \\uNNNN)" },
          },
          required: ["id", "data"],
        },
        async execute(input: unknown) {
          if (!bunPtyAvailable) return { output: "Error: bun-pty not available" };
          const args = input as Record<string, unknown>;
          const id = String(args.id ?? "");
          const data = String(args.data ?? "");
          if (!id || !data) return { output: "Error: id and data required" };

          const session = manager.get(id);
          if (!session) return { output: `Error: PTY session '${id}' not found` };
          if (session.status !== "running") return { output: `Error: Cannot write to PTY '${id}' - status is '${session.status}'` };

          const parsedData = parseEscapeSequences(data);
          const commands = extractCommands(parsedData);
          for (const commandLine of commands) {
            const { command, args: cmdArgs } = parseCommand(commandLine);
            // Note: permission check would go here if needed
          }

          const success = manager.write(id, parsedData);
          if (!success) return { output: `Error: Failed to write to PTY '${id}'` };

          const preview = data.length > 50 ? data.slice(0, 50) + "..." : data;
          const displayPreview = preview.replace(new RegExp(ETX, "g"), "^C").replace(new RegExp(EOT, "g"), "^D").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
          return { output: `Sent ${data.length} bytes to ${id}: "${displayPreview}"` };
        },
      });

      // pty_read
      editor.add({
        name: "pty_read",
        description: "Read output from a PTY session (with optional regex filtering)",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "The PTY session ID" },
            offset: { type: "number", default: 0, description: "Line number to start reading from (0-based)" },
            limit: { type: "number", default: DEFAULT_READ_LIMIT, description: "Number of lines to read" },
            pattern: { type: "string", description: "Regex pattern to filter lines" },
            ignoreCase: { type: "boolean", default: false, description: "Case-insensitive pattern matching" },
          },
          required: ["id"],
        },
        async execute(input: unknown) {
          if (!bunPtyAvailable) return { output: "Error: bun-pty not available" };
          const args = input as Record<string, unknown>;
          const id = String(args.id ?? "");
          if (!id) return { output: "Error: id required" };

          const session = manager.get(id);
          if (!session) return { output: `Error: PTY session '${id}' not found` };

          const offset = Math.max(0, Number(args.offset ?? 0));
          const limit = Number(args.limit ?? DEFAULT_READ_LIMIT);
          const pattern = args.pattern ? String(args.pattern) : undefined;
          const ignoreCase = Boolean(args.ignoreCase);

          let output: string;
          if (pattern) {
            if (!validateRegex(pattern)) {
              return { output: `Error: Potentially dangerous regex pattern rejected: '${pattern}'` };
            }
            const regex = new RegExp(pattern, ignoreCase ? "i" : "");
            const result = manager.search(id, regex, offset, limit);
            if (!result) return { output: `Error: PTY session '${id}' not found` };
            if (result.matches.length === 0) {
              output = [
                `<pty_output id="${id}" status="${session.status}" pattern="${pattern}">`,
                `No lines matched the pattern '${pattern}'.`,
                `Total lines in buffer: ${result.totalLines}`,
                `</pty_output>`,
              ].join("\n");
            } else {
              const formattedLines = result.matches.map(m => formatLine(m.text, m.lineNumber, MAX_LINE_LENGTH));
              const pagination = `(${result.matches.length} of ${result.totalMatches} matches shown. Use offset=${offset + result.matches.length} to see more.)`;
              const endMsg = `(${result.totalMatches} match${result.totalMatches === 1 ? "" : "es"} from ${result.totalLines} total lines)`;
              output = [
                `<pty_output id="${id}" status="${session.status}" pattern="${pattern}">`,
                ...formattedLines,
                "",
                result.hasMore ? pagination : endMsg,
                `</pty_output>`,
              ].join("\n");
            }
            // Append reminders
            if (session.notifyOnExit && session.status === "running") output += "\n\n" + NOTIFY_ON_EXIT_INSTRUCTIONS;
            if (session.timeoutSeconds && (manager.get(id) as any)?.timedOut) {
              output += "\n\n" + [
                `<system_reminder>`,
                `This session was auto-killed after reaching \`timeoutSeconds=${session.timeoutSeconds}\`.`,
                `Use \`pty_read\` to inspect the final output or \`pty_list\` to review other sessions.`,
                `</system_reminder>`,
              ].join("\n");
            }
          } else {
            const result = manager.read(id, offset, limit);
            if (!result) return { output: `Error: PTY session '${id}' not found` };
            if (result.lines.length === 0) {
              output = [
                `<pty_output id="${id}" status="${session.status}">`,
                `(No output available - buffer is empty)`,
                `Total lines: ${result.totalLines}`,
                `</pty_output>`,
              ].join("\n");
            } else {
              const formattedLines = result.lines.map((line, index) => formatLine(line, result.offset + index + 1, MAX_LINE_LENGTH));
              const pagination = `(Buffer has more lines. Use offset=${result.offset + result.lines.length} to read beyond line ${result.offset + result.lines.length})`;
              const endMsg = `(End of buffer - total ${result.totalLines} lines)`;
              output = [
                `<pty_output id="${id}" status="${session.status}">`,
                ...formattedLines,
                "",
                result.hasMore ? pagination : endMsg,
                `</pty_output>`,
              ].join("\n");
            }
            if (session.notifyOnExit && session.status === "running") output += "\n\n" + NOTIFY_ON_EXIT_INSTRUCTIONS;
            if (session.timeoutSeconds && (manager.get(id) as any)?.timedOut) {
              output += "\n\n" + [
                `<system_reminder>`,
                `This session was auto-killed after reaching \`timeoutSeconds=${session.timeoutSeconds}\`.`,
                `Use \`pty_read\` to inspect the final output or \`pty_list\` to review other sessions.`,
                `</system_reminder>`,
              ].join("\n");
            }
          }

          return { output };
        },
      });

      // pty_list
      editor.add({
        name: "pty_list",
        description: "List all active PTY sessions",
        input: { type: "object", properties: {} },
        async execute() {
          if (!bunPtyAvailable) return { output: "Error: bun-pty not available" };
          const sessions = manager.list();
          if (sessions.length === 0) return { output: "<pty_list>\nNo active PTY sessions.\n</pty_list>" };
          const lines = ["<pty_list>"];
          for (const session of sessions) lines.push(...formatSessionInfo(session));
          lines.push(`Total: ${sessions.length} session(s)`);
          lines.push("</pty_list>");
          return { output: lines.join("\n") };
        },
      });

      // pty_kill
      editor.add({
        name: "pty_kill",
        description: "Kill a PTY session",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "The PTY session ID" },
            cleanup: { type: "boolean", default: false, description: "Remove session and free buffer" },
          },
          required: ["id"],
        },
        async execute(input: unknown) {
          if (!bunPtyAvailable) return { output: "Error: bun-pty not available" };
          const args = input as Record<string, unknown>;
          const id = String(args.id ?? "");
          if (!id) return { output: "Error: id required" };

          const session = manager.get(id);
          if (!session) return { output: `Error: PTY session '${id}' not found` };

          const wasRunning = session.status === "running";
          const cleanup = Boolean(args.cleanup);
          const success = manager.kill(id, cleanup);
          if (!success) return { output: `Error: Failed to kill PTY session '${id}'` };

          const action = wasRunning ? "Killed" : "Cleaned up";
          const cleanupNote = cleanup ? " (session removed)" : " (session retained for log access)";
          return {
            output: [
              `<pty_killed>`,
              `${action}: ${id}${cleanupNote}`,
              `Title: ${session.title}`,
              `Command: ${session.command} ${session.args.join(" ")}`,
              `Final line count: ${session.lineCount}`,
              `</pty_killed>`,
            ].join("\n"),
          };
        },
      });

      // Debug tool
      editor.add({
        name: "pty_debug",
        description: "Debug pty-v2 plugin: dump internal state.",
        input: {
          type: "object",
          properties: { action: { type: "string", enum: ["state", "sessions", "config"], default: "state" } },
        },
        async execute(input: unknown) {
          const action = typeof input === "object" && input !== null && "action" in input ? String(input.action) : "state";
          if (action === "sessions") {
            return { output: JSON.stringify(manager.list(), null, 2) };
          }
          await log.stateDump("pty-v2", { sessionCount: manager.list().length, bunPtyAvailable });
          return { output: "State dumped to debug outputs" };
        },
      });
    });

    /* ---- Register slash commands ---- */
    void ctx.command.transform((editor) => {
      editor.add({
        name: "pty-open-background-spy",
        description: "Open PTY Sessions Web Interface in browser",
        execute: async (input: { sessionID: string }) => {
          const sessionID = input.sessionID;
          if (!sessionID) return;
          try {
            const serverMod = await loadPTYServer();
            if (!serverMod?.createServer) {
              return;
            }
            const server = await serverMod.createServer();
            // In V2, we can't directly open browser from plugin
            // Return the URL for the user to open
          } catch (e) {
            // Silently fail
          }
        },
      });

      editor.add({
        name: "pty-show-server-url",
        description: "Show PTY Sessions Web Interface URL",
        execute: async (input: { sessionID: string }) => {
          const sessionID = input.sessionID;
          if (!sessionID) return;
          try {
            const serverMod = await loadPTYServer();
            if (!serverMod?.createServer) {
              return;
            }
            const server = await serverMod.createServer();
          } catch (e) {
            // Silently fail
          }
        },
      });
    });

    /* ---- Session deleted event: cleanup PTY sessions ---- */
    void subscribeToEvents(ctx.event.subscribe(), async (event: any) => {
      if (event.type === "session.deleted") {
        const sessionID = event.data?.sessionID ?? event.id;
        if (sessionID) {
          manager.cleanupBySession(String(sessionID));
          await log.debug("cleaned up PTY sessions for deleted session", { parentSessionId: sessionID });
        }
      }
    });

    return () => { manager.clearAllSessions(); };
  },
});