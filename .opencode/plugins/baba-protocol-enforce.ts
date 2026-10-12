/**
 * Protocol Enforcement Plugin for opencode (V2)
 *
 * Enforces cross-cutting protocols at phase transitions:
 * - Artifact handling (gitignore, .gitattributes)
 * - Pre-commit behavior
 * - Cross-team requirements
 * - Library selection
 * - Spec lifecycle / DRIFT
 *
 * Phase transitions are detected via baba-phase-detect, which parses assistant
 * message text for [PHASE: X] headers. opencode session metadata does not carry
 * phase information, so the phase is re-derived from the message history the
 * `context` session hook hands over.
 *
 * V2 changes:
 *   - `tool.execute.before` / `tool.execute.after` became `ctx.tool.hook(...)`.
 *     The mutable argument bag is `event.input` (V1: `output.args`), and a
 *     throw from `execute.before` still cancels the call.
 *   - `experimental.chat.messages.transform` became `ctx.session.hook("context")`,
 *     which supplies `event.messages` and `event.sessionID` directly -- the V1
 *     hook's input was typed `{}` and carried no id at all.
 *   - The V1 `event` hook became an async-iterable `ctx.event.subscribe()`.
 */

import { access, readFile } from "node:fs/promises";
import { Plugin } from "@opencode/plugin";
import { getCurrentPhase, updatePhaseFromMessages } from "../lib/baba-phase-detect";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

interface ProtocolState {
  sessionId: string;
  currentPhase: string;
  specVersion: string | null;
  hasSpec: boolean;
  editedFiles: string[];
  protocolsChecked: Set<string>;
  planVersion: number; // 1 = PLAN v1 start, 2 = post-reload
}

const protocolStates = new Map<string, ProtocolState>();

interface ProtocolCheck {
  protocol: string;
  passed: boolean;
  message: string;
}

const PHASE_TRANSITIONS: Record<string, string[]> = {
  REVIEW: ["artifact-handling", "pre-commit"],
  PLAN: ["cross-team"],
  PATCH: [],
  DRIFT: ["spec-fileExists"],
  CHECKLIST: ["artifact-handling"],
};

const PROTOCOL_CHECKS: Record<
  string,
  (directory: string, editedFiles: string[], state: ProtocolState) => Promise<ProtocolCheck[]>
> = {
  "artifact-handling": async (directory) => {
    const checks: ProtocolCheck[] = [];
    const gitignorePath = `${directory}/.gitignore`;
    const hasGitignore = await fileExists(gitignorePath);
    if (!hasGitignore) {
      checks.push({
        protocol: "artifact-handling",
        passed: false,
        message: ".gitignore missing",
      });
    } else {
      const content = await readFile(gitignorePath, "utf-8");
      const required = [".playwright-mcp/"];
      for (const req of required) {
        if (!content.includes(req)) {
          checks.push({
            protocol: "artifact-handling",
            passed: false,
            message: `gitignore missing: ${req}`,
          });
        }
      }
    }
    const gitattributesPath = `${directory}/.gitattributes`;
    const hasGitattributes = await fileExists(gitattributesPath);
    if (!hasGitattributes) {
      checks.push({
        protocol: "gitattributes",
        passed: false,
        message: ".gitattributes missing (recommend: * text=auto eol=lf)",
      });
    }
    return checks;
  },

  "pre-commit": async (directory) => {
    const checks: ProtocolCheck[] = [];
    const precommitPath = `${directory}/.pre-commit-config.yaml`;
    const huskyPath = `${directory}/.husky/pre-commit`;
    const hasPrecommit = await fileExists(precommitPath);
    const hasHusky = await fileExists(huskyPath);
    if (!hasPrecommit && !hasHusky) {
      checks.push({
        protocol: "pre-commit",
        passed: false,
        message: "No pre-commit hooks configured (pre-commit or husky)",
      });
    } else if (hasPrecommit) {
      const content = await readFile(precommitPath, "utf-8");
      const required = ["formatter", "linter", "secret"];
      for (const req of required) {
        if (!content.toLowerCase().includes(req)) {
          checks.push({
            protocol: "pre-commit",
            passed: false,
            message: `Pre-commit may lack ${req} hook`,
          });
        }
      }
    }
    return checks;
  },

  "cross-team": async (directory) => {
    const checks: ProtocolCheck[] = [];
    const changesPath = `${directory}/CHANGES_REQUIRED.md`;
    const hasChanges = await fileExists(changesPath);
    if (hasChanges) {
      const content = await readFile(changesPath, "utf-8");
      const unresolved = content
        .split("## ")
        .filter((s) => s.includes("Priority:") && !s.includes("Resolved:")).length;
      if (unresolved > 0) {
        checks.push({
          protocol: "cross-team",
          passed: false,
          message: `${unresolved} unresolved cross-team requirements in CHANGES_REQUIRED.md`,
        });
      }
    }
    return checks;
  },

  "spec-fileExists": async (directory, _editedFiles, state) => {
    const checks: ProtocolCheck[] = [];
    const specFile = `${directory}/SPEC.md`;
    const hasSpec = await fileExists(specFile);
    const specVersion = state.specVersion;
    if (!hasSpec || !specVersion) {
      checks.push({
        protocol: "spec",
        passed: false,
        message: "No SPEC.md or spec_version not set - DRIFT not applicable",
      });
    }
    return checks;
  },
};

async function checkProtocols(state: ProtocolState, directory: string): Promise<ProtocolCheck[]> {
  const requiredProtocols = PHASE_TRANSITIONS[state.currentPhase] ?? [];
  const allChecks: ProtocolCheck[] = [];

  for (const protocol of requiredProtocols) {
    if (state.protocolsChecked.has(protocol)) continue;
    const checkFn = PROTOCOL_CHECKS[protocol];
    if (!checkFn) continue;
    const checks = await checkFn(directory, state.editedFiles, state);
    allChecks.push(...checks);
    state.protocolsChecked.add(protocol);
  }

  return allChecks;
}

// Credential sanitization helpers (H1 compliance)
function sanitizeGitPushOutput(output: string): string {
  return output
    .replace(/^To\s+https?:\/\/\S+$/gm, "To <url>")
    .replace(/oauth2:[^@\s]+@/g, "oauth2:<token>@")
    .replace(/x-access-token:[^@\s]+@/g, "x-access-token:<token>@")
    .replace(/https?:\/\/[^@\s]+@/g, "https://<redacted>@");
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

/** Narrows the mutable V2 tool input bag to its shell command argument. */
function readCommand(event: { input: unknown }): { set: (next: string) => void; raw: string } | undefined {
  if (typeof event.input !== "object" || event.input === null) return undefined;
  const args = event.input as { command?: unknown };
  const raw = String(args.command ?? "").trim();
  return { set: (next: string) => { args.command = next; }, raw };
}

export default Plugin.define({
  id: "baba-protocol-enforce",

  setup(ctx) {
    const directory = ctx.location.directory;
    const log = createDebug("baba-protocol-enforce");

    void log.debug("plugin initialized", { directory, phaseTransitions: PHASE_TRANSITIONS });

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      if (event.type !== "session.created" && event.type !== "session.deleted") return;
      const sessionId = readDataString(event, "sessionID");
      if (!sessionId) return;

      if (event.type === "session.created") {
        protocolStates.set(sessionId, {
          sessionId,
          currentPhase: "STARTUP",
          specVersion: null,
          hasSpec: false,
          editedFiles: [],
          protocolsChecked: new Set(),
          planVersion: 1,
        });
        await log.info("session created", { session: sessionId, phase: "STARTUP" });
        return;
      }

      void log.debug("session deleted, cleaning up", { session: sessionId });
      protocolStates.delete(sessionId);
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "baba_protocol_enforce_debug",
        description: "Debug baba-protocol-enforce plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "sessions", "protocols"],
              default: "state",
              description:
                "What to dump: state (all), sessions (protocol states per session), protocols (phase transition config)",
            },
          },
        },
        async execute(input: unknown) {
          const action = readStringField(input, "action") ?? "state";
          if (action === "sessions") {
            const sessions: Record<string, unknown> = {};
            for (const [id, state] of protocolStates) {
              sessions[id] = {
                sessionId: state.sessionId,
                currentPhase: state.currentPhase,
                specVersion: state.specVersion,
                hasSpec: state.hasSpec,
                editedFiles: state.editedFiles,
                protocolsChecked: [...state.protocolsChecked],
                planVersion: state.planVersion,
              };
            }
            return { output: JSON.stringify(sessions, null, 2) };
          }
          if (action === "protocols") {
            return { output: JSON.stringify({ phaseTransitions: PHASE_TRANSITIONS }, null, 2) };
          }
          await log.stateDump("baba-protocol-enforce", {
            sessionCount: protocolStates.size,
            sessions: Object.fromEntries(protocolStates),
            phaseTransitions: PHASE_TRANSITIONS,
          });
          return { output: "State dumped to debug outputs (console, file, client.app.log)" };
        },
      });
    });

    void ctx.tool.hook("execute.before", async (event) => {
      if (event.tool !== "bash") return;

      const command = readCommand(event);
      if (!command) return;
      const cmd = command.raw;

      // git remote -v / get-url: block via tokenized shell matching, so
      // `cd /repo && git remote -v` and `git remote -v | cat` cannot evade.
      if (/(^|[;&|]\s*)git\b[^;&|]*\bremote\b[^;&|]*\s-v\b/.test(cmd)) {
        await log.debug("blocking git remote -v, replacing with git remote", { command: cmd });
        command.set("git remote");
        return;
      }
      if (/(^|[;&|]\s*)git\b[^;&|]*\bremote\b[^;&|]*\bget-url\b/.test(cmd)) {
        await log.warn("blocking git remote get-url", { command: cmd });
        throw new Error(
          "H1: `git remote get-url` is blocked -- remote URLs embed OAuth2/PAT tokens. " +
            "Use `git remote` (names only). If you need to verify a URL shape, ask the user.",
        );
      }
    });

    void ctx.tool.hook("execute.after", async (event) => {
      if (event.tool !== "bash") return;
      if (event.status !== "completed") return;

      const command = readCommand(event);
      if (!command) return;
      if (!/^(|[;&|]\s*)git\b[^;&|]*\bpush\b/.test(command.raw)) return;

      const result = event.result as { output?: unknown; content?: unknown };
      const out = typeof result?.output === "string" ? result.output : undefined;
      if (out === undefined) return;

      await log.debug("sanitizing git push output", { command: command.raw });
      // Result fields are readonly, so the sanitized text goes back through a
      // fresh object rather than an in-place mutation.
      (event as { result: unknown }).result = { ...result, output: sanitizeGitPushOutput(out) };
    });

    void ctx.session.hook("context", async (event) => {
      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;
      if (!Array.isArray(event.messages)) return;

      const state = protocolStates.get(sessionId);
      if (!state) return;

      updatePhaseFromMessages(sessionId, event.messages);

      const newPhase = getCurrentPhase(sessionId);
      if (!newPhase || newPhase === state.currentPhase) return;

      const previousPhase = state.currentPhase;
      state.currentPhase = newPhase;
      state.protocolsChecked.clear();

      await log.info("phase transition", { session: sessionId, from: previousPhase, to: newPhase });

      // Signal PLAN v1 start at REVIEW -> PLAN transition
      if (previousPhase === "REVIEW" && newPhase === "PLAN") {
        state.planVersion = 1;
        await log.info("REVIEW->PLAN transition, planVersion=1", { session: sessionId });
      }

      const checks = await checkProtocols(state, directory);
      const failed = checks.filter((c) => !c.passed);

      if (failed.length > 0) {
        await log.warn("protocol checks failed", {
          session: sessionId,
          phase: newPhase,
          failed: failed.map((f) => `${f.protocol}: ${f.message}`),
        });
      }
    });

    return () => {
      protocolStates.clear();
    };
  },
});