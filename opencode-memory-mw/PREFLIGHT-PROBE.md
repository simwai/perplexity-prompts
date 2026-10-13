# Desktop Preflight Probe Pack

Produces brief §1.6 readings 1–6 on the user's machine. Five minutes: drop
the probe plugin in, load Desktop once, paste back the six readings.

## Probe plugin (V2)

Save as `.opencode/plugins/preflight-probe.ts`, start OpenCode Desktop, then
remove the file. It performs no writes and registers no tools.

This uses the **V2** entrypoint. The V1 shape (`export default async (input) => ({ hooks })`)
does not load on Desktop 1.19.0, so a probe written that way looks like a
silent no-op rather than a failure.

```typescript
import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "preflight-probe",

  setup(ctx) {
    const versions = globalThis.process?.versions as unknown as
      | { electron?: string; node?: string }
      | undefined;
    const lines = [
      `electron=${versions?.electron ?? "absent"}`,
      `node=${versions?.node ?? "absent"}`,
      `typeof globalThis.Bun=${typeof (globalThis as unknown as { Bun?: unknown }).Bun}`,
      // V2 has no Bun shell on the plugin context; expect undefined.
      `ctx-location=${typeof ctx.location?.directory}`,
    ];
    try {
      await import("node:sqlite");
      lines.push("node:sqlite=loads");
    } catch {
      lines.push("node:sqlite=missing");
    }
    // No client.app.log in V2 -- the reading is gone, not failed.
    lines.push("app-log=removed-in-v2");

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "preflight_probe",
        description: "Print the six Desktop preflight readings.",
        input: { type: "object", properties: {} },
        async execute() {
          return { output: lines.join("\n") };
        },
      });
    });
  },
});
```

## Readings to paste back

1. `electron=` and `node=` versions plus `typeof globalThis.Bun`
   (expect `undefined` on Desktop).
2. `ctx-location=` — `string` means the V2 plugin context is present.
3. SQLite backend — `node:sqlite=loads` or `missing`; if missing, also try
   `better-sqlite3` and `@tursodatabase/database` and report which import
   succeeds under the sidecar.
4. Native binding result for `@tursodatabase/database` (loads or blocker).
5. Whether the probe plugin itself loads on Desktop without a
   `globalThis.Bun` crash.
6. Whether the same file loads unchanged on CLI (Bun).

Report format: the six lines plus Desktop version (for example v1.19.0).
If any reading contradicts the brief, stop and report before Stage 1 work
continues.
