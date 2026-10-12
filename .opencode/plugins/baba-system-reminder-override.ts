/**
 * Baba System-Reminder Override Plugin for opencode (V2)
 *
 * Intercepts the native runtime plan->build system-reminder injection and
 * replaces it with a stable, explicit reminder that matches the project's
 * preferred wording.
 *
 * V2 mapping: the V1 `experimental.chat.system.transform` hook became
 * `ctx.session.hook("context")`, and `output.system` changed from `string[]`
 * to `SystemPart[]` (objects with `text`, not bare strings).
 *
 * Hook: ctx.session.hook("context")
 * Trigger: every model request whose system array contains the
 * runtime-generated plan-to-build reminder text.
 * Effect: replace that reminder with the canonical override text.
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";

const PLAN_TO_BUILD_MARKERS = [
  "operational mode has changed from plan to build",
  "no longer in read-only mode",
  "permitted to make file changes",
  "utilize your arsenal of tools",
];

const OVERRIDE_REMINDER = `<system-reminder>
Your operational mode has changed from plan to build.
You are no longer in read-only mode.
You are permitted to make file changes, run shell commands, and utilize your arsenal of tools as needed.
</system-reminder>`;

function isPlanToBuildReminder(text: string): boolean {
  const lower = text.toLowerCase();
  return PLAN_TO_BUILD_MARKERS.every((marker) => lower.includes(marker));
}

/** Tool args arrive as `unknown`; the JSON Schema cannot narrow them for TS. */
function readAction(input: unknown): string {
  if (typeof input !== "object" || input === null || !("action" in input)) return "state";
  const action = (input as { action: unknown }).action;
  return typeof action === "string" ? action : "state";
}

export default Plugin.define({
  id: "baba-system-reminder-override",

  setup(ctx) {
    // V2 has no client.app.log surface, so the debug logger gets no client.
    // Console and JSONL-file destinations are unaffected.
    const log = createDebug("baba-system-reminder-override");

    void log.debug("plugin initialized", {
      markers: PLAN_TO_BUILD_MARKERS,
      overrideLength: OVERRIDE_REMINDER.length,
    });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "baba_system_reminder_override_debug",
        description: "Debug baba-system-reminder-override plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "markers", "override"],
              default: "state",
              description:
                "What to dump: state (all), markers (detection markers), override (override text)",
            },
          },
        },
        async execute(input: unknown) {
          const action = readAction(input);
          switch (action) {
            case "markers":
              return { output: JSON.stringify({ markers: PLAN_TO_BUILD_MARKERS }, null, 2) };
            case "override":
              return { output: JSON.stringify({ override: OVERRIDE_REMINDER }, null, 2) };
            case "state":
            default:
              await log.stateDump("baba-system-reminder-override", {
                markers: PLAN_TO_BUILD_MARKERS,
                overrideLength: OVERRIDE_REMINDER.length,
              });
              return { output: "State dumped to debug outputs (console, file, client.app.log)" };
          }
        },
      });
    });

    void ctx.session.hook("context", async (event) => {
      const system = event.system;
      if (!Array.isArray(system)) return;

      let replacedCount = 0;
      // SystemPart fields are readonly, so a matching block is rebuilt rather
      // than mutated in place.
      const next = system.map((part) => {
        if (part?.type !== "text" || typeof part.text !== "string") return part;
        if (!isPlanToBuildReminder(part.text)) return part;
        replacedCount++;
        return { ...part, text: OVERRIDE_REMINDER };
      });

      if (replacedCount > 0) {
        event.system = next;
        await log.info("replaced plan-to-build reminder", {
          originalBlocks: system.length,
          replacedCount,
        });
      }
    });
  },
});