import type { ToolDefinition } from "@opencode-ai/plugin";
import { getTuningParams } from "../db/queries.js";
import { DEFAULT_TUNING_PARAMS, validateTuningParams, createAuditEntry } from "../core/governance.js";

export const memoryTuneTool: ToolDefinition = {
  name: "memory_tune",
  description: "Adjust a tuning knob. Requires a written rationale. Only one knob per call.",
  parameters: {
    type: "object",
    properties: {
      knob: { type: "string", description: "Knob name: decay_rate, trust_quantile, doubt_quantile, min_evidence, active_partition" },
      value: { type: ["number", "string"], description: "New value (not needed for active_partition which takes a string)" },
      rationale: { type: "string", description: "One-sentence explanation for this change" },
    },
    required: ["knob", "rationale"],
  },
  async execute(args, context) {
    const knob = String(args.knob ?? "");
    const rationale = String(args.rationale ?? "").trim();
    const client = (context as { $: LibSQLClient }).$;

    if (!rationale || rationale.length < 10) {
      return { output: "Error: A rationale of at least 10 characters is required for every tuning change." };
    }

    const currentParams = await getTuningParams(client);
    const oldValues = { ...currentParams };

    const updates: Record<string, unknown> = {};
    if (knob === "active_partition") {
      updates[knob] = String(args.value ?? "").trim();
    } else {
      updates[knob] = Number(args.value);
    }

    const validation = validateTuningParams(updates as Partial<typeof DEFAULT_TUNING_PARAMS>);
    if (!validation.ok) return { output: `Error: ${validation.error}` };

    const newValue = updates[knob];
    await client.execute({
      sql: `INSERT OR REPLACE INTO tuning_param (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      args: [knob, newValue],
    });

    const audit = createAuditEntry("agent", rationale, oldValues, updates);
    await client.execute({
      sql: `INSERT INTO tuning_audit (changed_by, rationale, old_values, new_values) VALUES (?, ?, ?, ?)`,
      args: [audit.changed_by, audit.rationale, JSON.stringify(audit.old_values), JSON.stringify(audit.new_values)],
    });

    return { output: JSON.stringify({ tuned: true, knob, new_value: newValue, rationale }) };
  },
};
