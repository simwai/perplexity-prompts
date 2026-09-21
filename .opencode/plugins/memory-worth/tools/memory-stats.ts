import type { ToolDefinition } from "@opencode-ai/plugin";
import { getTuningParams } from "../db/queries.js";

export const memoryStatsTool: ToolDefinition = {
  name: "memory_stats",
  description: "Inspect memory health: calibration, discrimination, distribution, and named flags. Use this before tuning.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(args, context) {
    const client = (context as { $: LibSQLClient }).$;
    const params = await getTuningParams(client);

    const totalMemoriesResult = await client.execute({
      sql: `SELECT COUNT(*) AS cnt FROM memory WHERE deleted_at IS NULL`,
      args: [],
    });
    const totalMemories = Number((totalMemoriesResult.rows[0] as { cnt: number }).cnt);

    const totalOutcomesResult = await client.execute({
      sql: `SELECT COUNT(*) AS cnt FROM outcome`,
      args: [],
    });
    const totalOutcomes = Number((totalOutcomesResult.rows[0] as { cnt: number }).cnt);

    if (totalMemories === 0 || totalOutcomes === 0) {
      return {
        output: JSON.stringify({
          status: "insufficient_data",
          message: "Not enough data to generate meaningful stats.",
          memories: totalMemories,
          outcomes: totalOutcomes,
        }),
      };
    }

    const memoriesWithScores = await client.execute({
      sql: `SELECT m.ema_success, m.ema_failure, o.outcome FROM memory m JOIN outcome o ON o.memory_id = m.id WHERE m.deleted_at IS NULL AND m.evidence_count >= ?`,
      args: [params.min_evidence ?? 5],
    });

    const scored: { predicted: number; actual: number }[] = [];
    for (const row of memoriesWithScores.rows) {
      const r = row as unknown as { ema_success: number; ema_failure: number; outcome: number };
      const total = r.ema_success + r.ema_failure;
      const predicted = total === 0 ? 0.5 : r.ema_success / total;
      scored.push({ predicted, actual: r.outcome });
    }

    const deciles: { bin: string; count: number; avg_predicted: number; avg_actual: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const lo = i / 10;
      const hi = (i + 1) / 10;
      const inBin = scored.filter((s) => s.predicted >= lo && s.predicted < hi);
      const avgPredicted = inBin.length > 0 ? inBin.reduce((sum, s) => sum + s.predicted, 0) / inBin.length : 0;
      const avgActual = inBin.length > 0 ? inBin.reduce((sum, s) => sum + s.actual, 0) / inBin.length : 0;
      deciles.push({ bin: `${Math.round(lo * 100)}-${Math.round(hi * 100)}%`, count: inBin.length, avg_predicted: avgPredicted, avg_actual: avgActual });
    }

    const calibrationError = deciles.reduce((sum, d) => sum + Math.abs(d.avg_predicted - d.avg_actual), 0) / deciles.length;

    const highTrust = scored.filter((s) => s.predicted >= 0.7);
    const lowTrust = scored.filter((s) => s.predicted <= 0.3);
    const highRate = highTrust.length > 0 ? highTrust.reduce((sum, r) => sum + r.actual, 0) / highTrust.length : 0;
    const lowRate = lowTrust.length > 0 ? lowTrust.reduce((sum, r) => sum + r.actual, 0) / lowTrust.length : 0;
    const discrimination = highRate - lowRate;

    const allScores = scored.map((s) => s.predicted).sort((a, b) => a - b);
    const pct = (p: number) => allScores[Math.floor(allScores.length * p)] || 0;

    const flags: string[] = [];
    if (calibrationError > 0.15) flags.push("calibration is degrading");
    if (discrimination < 0.05 && scored.length > 20) flags.push("I can't tell good memories from bad ones");
    if (highRate < lowRate + 0.05 && highTrust.length > 10 && lowTrust.length > 10) flags.push("my scores are worse than guessing");

    const status = flags.length === 0
      ? "nominal"
      : flags.some((f) => f.includes("worse than guessing") || f.includes("can't tell"))
        ? "degraded"
        : "watch";

    return {
      output: JSON.stringify({
        status,
        memories: totalMemories,
        outcomes: totalOutcomes,
        calibration: { error: Math.round(calibrationError * 1000) / 1000, deciles },
        discrimination: {
          high_trust_rate: Math.round(highRate * 1000) / 1000,
          low_trust_rate: Math.round(lowRate * 1000) / 1000,
          delta: Math.round(discrimination * 1000) / 1000,
        },
        distribution: {
          p5: Math.round(pct(0.05) * 100) / 100,
          p25: Math.round(pct(0.25) * 100) / 100,
          p50: Math.round(pct(0.50) * 100) / 100,
          p75: Math.round(pct(0.75) * 100) / 100,
          p95: Math.round(pct(0.95) * 100) / 100,
        },
        flags,
        recommendation: flags.length > 0 ? flags[0] : "no action needed",
      }),
    };
  },
};
