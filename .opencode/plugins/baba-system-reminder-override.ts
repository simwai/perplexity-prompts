/**
 * Baba System-Reminder Override Plugin for opencode
 *
 * Intercepts the native runtime plan->build system-reminder injection
 * and replaces it with a stable, explicit reminder that matches the
 * project's preferred wording.
 *
 * Hook: experimental.chat.system.transform
 * Trigger: every assistant turn where the system prompt array contains
 * the runtime-generated plan-to-build reminder text.
 * Effect: replace that reminder with the canonical override text.
 */

import { createDebug } from "../lib/baba-debug";
import { tool } from "@opencode-ai/plugin";

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

export default async (_ctx: any) => {
  const log = createDebug("baba-system-reminder-override", _ctx?.client);

  await log.debug("plugin initialized", {
    markers: PLAN_TO_BUILD_MARKERS,
    overrideLength: OVERRIDE_REMINDER.length,
  });

  return {
    tool: {
      baba_system_reminder_override_debug: tool({
        description: "Debug baba-system-reminder-override plugin: dump internal state.",
        args: {
          action: tool.schema
            .enum(["state", "markers", "override"])
            .default("state")
            .describe("What to dump: state (all), markers (detected markers), override (override text)"),
        },
        async execute(args) {
          const action = args.action ?? "state";
          switch (action) {
            case "markers":
              return JSON.stringify({ markers: PLAN_TO_BUILD_MARKERS }, null, 2);
            case "override":
              return JSON.stringify({ override: OVERRIDE_REMINDER }, null, 2);
            case "state":
            default: {
              await log.stateDump("baba-system-reminder-override", {
                markers: PLAN_TO_BUILD_MARKERS,
                overrideLength: OVERRIDE_REMINDER.length,
              });
              return "State dumped to debug outputs (console, file, client.app.log)";
            }
          }
        },
      }),
    },

    "experimental.chat.system.transform": async (
      _ctx: unknown,
      { system }: { system: string[] },
    ): Promise<void> => {
      if (!Array.isArray(system)) return;

      let replaced = false;
      const changed = system.map((block) => {
        const isMatch = isPlanToBuildReminder(block);
        if (isMatch) replaced = true;
        return isMatch ? OVERRIDE_REMINDER : block;
      });

      if (replaced) {
        await log.info("replaced plan-to-build reminder", { 
          originalBlocks: system.length, 
          replacedCount: changed.filter((v, i) => v !== system[i]).length 
        });
      }

      if (changed.length !== system.length || changed.some((v, i) => v !== system[i])) {
        system.length = 0;
        system.push(...changed);
      }
    },
  };
};
