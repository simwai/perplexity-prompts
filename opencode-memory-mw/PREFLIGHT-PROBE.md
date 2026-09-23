# Desktop Preflight Probe Pack

Produces brief §1.6 readings 1–6 on the user's machine. Five minutes: drop
the probe plugin in, load Desktop once, paste back the six readings.

## Probe plugin

Save as `.opencode/plugins/preflight-probe.ts`, start OpenCode Desktop, then
remove the file. It performs no writes and registers no tools.

```typescript
import type { Plugin } from "@opencode-ai/plugin";

const PreflightProbe: Plugin = async (input) => {
  const versions = globalThis.process?.versions as unknown as
    | { electron?: string; node?: string }
    | undefined;
  const lines = [
    `electron=${versions?.electron ?? "absent"}`,
    `node=${versions?.node ?? "absent"}`,
    `typeof globalThis.Bun=${typeof (globalThis as unknown as { Bun?: unknown }).Bun}`,
    `ctx-$=${typeof (input as unknown as { $?: unknown }).$}`,
  ];
  try {
    await import("node:sqlite");
    lines.push("node:sqlite=loads");
  } catch {
    lines.push("node:sqlite=missing");
  }
  try {
    await input.client.app.log({
      body: { service: "preflight-probe", level: "info", message: lines.join(" ") },
    });
    lines.push("app-log=ok");
  } catch {
    lines.push("app-log=failed");
  }
  return {
    event: async () => undefined,
    tool: {
      preflight_probe: (await import("@opencode-ai/plugin")).tool({
        description: "Print the six Desktop preflight readings.",
        args: {},
        async execute() {
          return { output: lines.join("\n") };
        },
      }),
    },
  };
};

export default PreflightProbe;
```

## Readings to paste back

1. `electron=` and `node=` versions plus `typeof globalThis.Bun`
   (expect `undefined` on Desktop).
2. `ctx-$=` — `function` means present, `undefined` means absent.
3. SQLite backend — `node:sqlite=loads` or `missing`; if missing, also try
   `better-sqlite3` and `@tursodatabase/database` and report which import
   succeeds under the sidecar.
4. Native binding result for `@tursodatabase/database` (loads or blocker).
5. Whether the probe plugin itself loads on Desktop without a
   `globalThis.Bun` crash.
6. Whether the same file loads unchanged on CLI (Bun).

Report format: the six lines plus Desktop version (for example v1.14.35).
If any reading contradicts the brief, stop and report before Stage 1 work
continues.
