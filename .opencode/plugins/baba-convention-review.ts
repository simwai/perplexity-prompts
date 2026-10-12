/**
 * Convention Review Plugin for opencode (V2)
 *
 * Emits convention-review prompts at PLAN entry, so the agent has to settle
 * architecture, API, and frontend conventions before writing code. Sources
 * conventions from Discovery Protocol system_evidence.
 *
 * V2 change: the V1 `experimental.chat.messages.transform` hook (which mutated
 * the last message's `parts` array) became `ctx.session.hook("context")`. The
 * prompts are prepended to `event.system` rather than spliced into message
 * parts -- same visibility for the model, no dependency on message-part shape.
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";

interface ConventionState {
  sessionId: string;
  promptsEmitted: boolean;
}

const conventionStates = new Map<string, ConventionState>();

function getOrCreateState(sessionId: string): ConventionState {
  let state = conventionStates.get(sessionId);
  if (!state) {
    state = { sessionId, promptsEmitted: false };
    conventionStates.set(sessionId, state);
  }
  return state;
}

interface SystemEvidence {
  architecture_flags?: {
    high_coupling?: { module?: string }[];
    circular_dependency?: { cycle?: string[] }[];
    pattern_concentration?: { pattern?: string }[];
  };
}

function buildArchitecturePrompt(evidence: SystemEvidence): string | null {
  const flags = evidence.architecture_flags;
  if (!flags) return null;

  const items: string[] = [];
  if (flags.high_coupling?.length) {
    items.push(`high coupling: ${flags.high_coupling.map((m) => m.module).filter(Boolean).join(", ")}`);
  }
  if (flags.circular_dependency?.length) {
    items.push(
      `circular deps: ${flags.circular_dependency
        .map((c) => (c.cycle ?? []).join(" -> "))
        .filter((c) => c.length > 0)
        .join(", ")}`,
    );
  }
  if (flags.pattern_concentration?.length) {
    items.push(
      `pattern concentration: ${flags.pattern_concentration
        .map((p) => p.pattern)
        .filter(Boolean)
        .join(", ")}`,
    );
  }

  if (!items.length) return null;

  return `[PHASE: PLAN]\n\n# Decision Needed\nQuestion: Architecture flags detected -- how to handle?\nRecommended: **A** -- Follow H16 Ownership Routing and H17 Layer Discipline through the identified owner modules.\n\n- **A**. Route through the identified owner modules (H16 ownership routing, H17 layer boundaries)\n  - Pros: single source of truth, respects architectural layer boundaries\n  - Cons: may require refactoring caller sites\n- B. Allow a local implementation that bypasses the architectural owner\n  - Pros: faster initial change\n  - Cons: violates H16 ownership routing, creates duplication\n\nReply with: A or B.`;
}

function buildApiDefaultsPrompt(editedFiles: string[]): string | null {
  const apiFiles = editedFiles.filter((f) =>
    f.includes("api") || f.includes("route") || f.includes("endpoint") ||
    f.includes("controller") || f.includes("handler") || f.includes("openapi")
  );
  if (!apiFiles.length) return null;

  return `[PHASE: PLAN]\n\n# Decision Needed\nQuestion: API design defaults for ${apiFiles.length} endpoint file(s)?\nRecommended: **A** -- Use URI versioning, cursor pagination, Idempotency-Key on mutations.\n\n- **A**. URI versioning (/v1/), cursor pagination, Idempotency-Key, RFC 7807 errors\n  - Pros: aligns with 07-protocols.md API architecture, observable in logs/caches\n  - Cons: more setup than header versioning\n- B. Header versioning, offset pagination, no idempotency\n  - Pros: simpler initial implementation\n  - Cons: breaks caching, retry safety, contract visibility\n\nReply with: A or B.`;
}

function buildDesignPrompt(editedFiles: string[]): string | null {
  const frontendFiles = editedFiles.filter((f) =>
    f.includes("components/") || f.includes("views/") ||
    f.endsWith(".vue") || f.endsWith(".tsx") || f.endsWith(".svelte")
  );
  if (!frontendFiles.length) return null;

  return `[PHASE: PLAN]\n\n# Decision Needed\nQuestion: Frontend design conventions -- defer to DESIGN_PLAN?\nRecommended: **A** -- BabaDesigner captures palette, typography, component library in DESIGN_PLAN.\n\n- **A**. Defer to DESIGN_PLAN phase (BabaDesigner owns this)\n  - Pros: single source of design decisions, no duplication\n  - Cons: requires DESIGN_PLAN phase\n- B. Set defaults here\n  - Pros: faster if no DESIGN_PLAN\n  - Cons: duplicates BabaDesigner responsibility\n\nReply with: A or B.`;
}

/** Newest message whose metadata carries the Discovery Protocol evidence. */
function readEvidence(messages: readonly unknown[]): {
  editedFiles: string[];
  systemEvidence: SystemEvidence;
} {
  const empty = { editedFiles: [] as string[], systemEvidence: {} as SystemEvidence };
  for (let i = messages.length - 1; i >= 0; i--) {
    const metadata = readMessageMetadata(messages[i]);
    if (!metadata) continue;
    const evidence = metadata.system_evidence;
    const edited = metadata.edited_files;
    if (typeof evidence !== "object" || evidence === null) continue;
    return {
      editedFiles: Array.isArray(edited) ? edited.filter((f): f is string => typeof f === "string") : [],
      systemEvidence: evidence as SystemEvidence,
    };
  }
  return empty;
}

function readMessageMetadata(message: unknown): Record<string, unknown> | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const metadata = (message as Record<string, unknown>).metadata;
  return typeof metadata === "object" && metadata !== null
    ? (metadata as Record<string, unknown>)
    : undefined;
}

/** Scans text parts for the `[PHASE: X]` marker, newest message first. */
function detectPhase(messages: readonly unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = (messages[i] as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const text = (part as { type?: unknown; text?: unknown }).text;
      const type = (part as { type?: unknown }).type;
      if (type !== "text" || typeof text !== "string") continue;
      const match = text.match(/^\[PHASE:\s*([A-Z_]+)\]/m);
      if (match) return match[1];
    }
  }
  return undefined;
}

export default Plugin.define({
  id: "baba-convention-review",

  setup(ctx) {
    const log = createDebug("baba-convention-review");

    void log.debug("plugin initialized");

    void subscribeToEvents(ctx.event.subscribe(), async (event) => {
      if (event.type !== "session.deleted") return;
      const sessionId = readDataString(event, "sessionID");
      if (sessionId) {
        void log.debug("session.deleted, cleaning up", { session: sessionId });
        conventionStates.delete(sessionId);
      }
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "baba_convention_review_debug",
        description: "Debug baba-convention-review plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "sessions", "config"],
              default: "state",
              description:
                "What to dump: state (all), sessions (convention states per session), config (plugin config)",
            },
          },
        },
        async execute(input: unknown) {
          const action = readStringField(input, "action") ?? "state";
          if (action === "sessions") {
            return { output: JSON.stringify(Object.fromEntries(conventionStates), null, 2) };
          }
          await log.stateDump("baba-convention-review", {
            sessionCount: conventionStates.size,
            sessions: Object.fromEntries(conventionStates),
          });
          return { output: "State dumped to debug outputs (console, file, client.app.log)" };
        },
      });
    });

    void ctx.session.hook("context", async (event) => {
      const messages = event.messages;
      if (!Array.isArray(messages) || messages.length === 0) return;

      const sessionId = event.sessionID;
      if (typeof sessionId !== "string" || sessionId.length === 0) return;

      const state = getOrCreateState(sessionId);
      const detectedPhase = detectPhase(messages);
      if (detectedPhase !== "PLAN" || state.promptsEmitted) return;

      const { editedFiles, systemEvidence } = readEvidence(messages);

      void log.debug("PLAN phase detected, checking convention prompts", {
        session: sessionId,
        editedFilesCount: editedFiles.length,
        hasArchitectureFlags: !!systemEvidence.architecture_flags,
        promptsEmitted: state.promptsEmitted,
      });

      const prompts = [
        buildArchitecturePrompt(systemEvidence),
        buildApiDefaultsPrompt(editedFiles),
        buildDesignPrompt(editedFiles),
      ].filter((p): p is string => typeof p === "string" && p.length > 0);

      if (prompts.length === 0) return;

      if (!Array.isArray(event.system)) return;
      event.system = [...prompts.map((text) => ({ type: "text" as const, text })), ...event.system];
      state.promptsEmitted = true;

      await log.info("convention prompts emitted", {
        session: sessionId,
        promptCount: prompts.length,
        editedFiles,
      });
    });

    return () => {
      conventionStates.clear();
    };
  },
});

function readDataString(event: unknown, key: string): string | undefined {
  if (typeof event !== "object" || event === null) return undefined;
  const data = (event as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}