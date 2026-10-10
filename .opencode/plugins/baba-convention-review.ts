/**
 * Convention Review Plugin for opencode
 *
 * Emits #DecisionNeeded blocks for conventions at PLAN entry
 * Triggers after prompt-system reload (planVersion=2)
 * Sources conventions from Discovery Protocol system_evidence
 */

import { getCurrentPhase } from "../lib/baba-phase-detect";
import { sessionIdFromEvent } from "../lib/baba-session-id";

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

function buildArchitecturePrompt(evidence: any): string | null {
  const flags = evidence?.architecture_flags;
  if (!flags) return null;

  const items = [];
  if (flags.high_coupling?.length) items.push(`high coupling: ${flags.high_coupling.map((m: any) => m.module).join(", ")}`);
  if (flags.circular_dependency?.length) items.push(`circular deps: ${flags.circular_dependency.map((c: any) => c.cycle.join(" \u2192 ")).join(", ")}`);
  if (flags.pattern_concentration?.length) items.push(`pattern concentration: ${flags.pattern_concentration.map((p: any) => p.pattern).join(", ")}`);

  if (!items.length) return null;

  return `[PHASE: PLAN]\n\n# Decision Needed\nQuestion: Architecture flags detected -- how to handle?\nRecommended: **A** -- Follow H16 Ownership Routing and H17 Layer Discipline through the identified owner modules.\n\n- **A**. Route through the identified owner modules (H16 ownership routing, H17 layer boundaries)\n  - Pros: single source of truth, respects architectural layer boundaries\n  - Cons: may require refactoring caller sites\n- B. Allow a local implementation that bypasses the architectural owner\n  - Pros: faster initial change\n  - Cons: violates H16 ownership routing, creates duplication\n\nReply with: A or B.`;
}

function buildApiDefaultsPrompt(evidence: any, editedFiles: string[]): string | null {
  const apiFiles = editedFiles.filter((f) =>
    f.includes("api") || f.includes("route") || f.includes("endpoint") ||
    f.includes("controller") || f.includes("handler") || f.includes("openapi")
  );
  if (!apiFiles.length) return null;

  return `[PHASE: PLAN]\n\n# Decision Needed\nQuestion: API design defaults for ${apiFiles.length} endpoint file(s)?\nRecommended: **A** -- Use URI versioning, cursor pagination, Idempotency-Key on mutations.\n\n- **A**. URI versioning (/v1/), cursor pagination, Idempotency-Key, RFC 7807 errors\n  - Pros: aligns with 07-protocols.md API architecture, observable in logs/caches\n  - Cons: more setup than header versioning\n- B. Header versioning, offset pagination, no idempotency\n  - Pros: simpler initial implementation\n  - Cons: breaks caching, retry safety, contract visibility\n\nReply with: A or B.`;
}

function buildDesignPrompt(evidence: any, editedFiles: string[]): string | null {
  const frontendFiles = editedFiles.filter((f) =>
    f.includes("components/") || f.includes("views/") ||
    f.endsWith(".vue") || f.endsWith(".tsx") || f.endsWith(".svelte")
  );
  if (!frontendFiles.length) return null;

  return `[PHASE: PLAN]\n\n# Decision Needed\nQuestion: Frontend design conventions -- defer to DESIGN_PLAN?\nRecommended: **A** -- BabaDesigner captures palette, typography, component library in DESIGN_PLAN.\n\n- **A**. Defer to DESIGN_PLAN phase (BabaDesigner owns this)\n  - Pros: single source of design decisions, no duplication\n  - Cons: requires DESIGN_PLAN phase\n- B. Set defaults here\n  - Pros: faster if no DESIGN_PLAN\n  - Cons: duplicates BabaDesigner responsibility\n\nReply with: A or B.`;
}

export default async ({ client, $, project, directory, worktree }: {
  client: any;
  $: any;
  project: any;
  directory: string;
  worktree: string;
}) => {
  return {
    "experimental.chat.messages.transform": async (
      input: Record<string, unknown>,
      output: { messages: any[] },
    ) => {
      // This hook's input is typed `{}` and carries no session id, so it is read
      // off the message info instead.
      const messages = output.messages;
      if (!messages || messages.length === 0) return;

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || !lastMessage.parts) return;

      const sessionId = lastMessage.info?.sessionID ?? lastMessage.sessionID;
      if (!sessionId) return;

      const info = lastMessage.info;
      const state = getOrCreateState(sessionId);

      let detectedPhase: string | undefined;
      for (const part of lastMessage.parts) {
        if (part.type !== "text" || !part.text) continue;
        const match = part.text.match(/^\[PHASE:\s*([A-Z_]+)\]/m);
        if (match) {
          detectedPhase = match[1];
          break;
        }
      }

      if (detectedPhase !== "PLAN" || state.promptsEmitted) return;

      // This hook's input is typed `{}`: it carries neither sessionID nor info,
      // so both reads below always produced undefined and the prompts never
      // fired. Session and metadata are read off the message info instead.
      const editedFiles: string[] = Array.isArray(info?.metadata?.edited_files)
        ? info.metadata.edited_files
        : [];
      const systemEvidence = info?.metadata?.system_evidence ?? {};

      const prompts = [
        buildArchitecturePrompt(systemEvidence),
        buildApiDefaultsPrompt(systemEvidence, editedFiles),
        buildDesignPrompt(systemEvidence, editedFiles),
      ].filter(Boolean);

      if (prompts.length > 0) {
        const conventionText = prompts.join("\n\n");
        const newParts = [
          { type: "text", text: conventionText },
          ...lastMessage.parts,
        ];
        lastMessage.parts = newParts;
        state.promptsEmitted = true;
        console.log("[convention-review] Emitted convention prompts at PLAN entry");
      }
    },

    event: async ({ event }: { event: any }) => {
      if (event.type === "session.deleted") {
        const sessionId = sessionIdFromEvent(event.properties);
        if (sessionId) conventionStates.delete(sessionId);
      }
    },
  };
};