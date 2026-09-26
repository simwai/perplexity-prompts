import { runDecisive } from "./experiment.js";
import { createSeededRandom } from "../../.opencode/plugins/memory-worth/core/prng.js";

export const SEARCH_SAMPLES = 128;

export interface SweepConfigParams {
  decayLambda?: number;
  detect?: number;
  falseAlarm?: number;
}

export interface SweepCell {
  seed: number;
  policies: string[];
  regretB: Record<string, number>;
  ttrB: Record<string, number | null>;
  staleRateB: Record<string, number>;
}

export interface SweepAggregate {
  mean: Record<string, number>;
  std: Record<string, number>;
  bySeed: SweepCell[];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sum = 0;
  for (const v of values) sum += (v - m) * (v - m);
  return Math.sqrt(sum / (values.length - 1));
}

export function runSeedSweep(seeds: number[]): SweepAggregate {
  const policies = ["vanilla", "no-forgetting", "decay", "clean-invalidation", "noisy-invalidation"] as const;
  const cells: SweepCell[] = [];
  for (const seed of seeds) {
    const decisive = runDecisive(seed);
    const regrets: Record<string, number> = {};
    const ttRs: Record<string, number | null> = {};
    const staleRates: Record<string, number> = {};
    for (const policy of policies) {
      const report = decisive.reports.find((r) => r.policy === policy);
      if (!report) throw new Error(`missing report for ${policy}`);
      regrets[policy] = report.regretB;
      ttRs[policy] = report.ttrB;
      staleRates[policy] = report.staleRateB;
    }
    cells.push({ seed, policies: policies as unknown as string[], regretB: regrets, ttrB: ttRs, staleRateB: staleRates });
  }

  const meanRegret: Record<string, number> = {};
  const stdRegret: Record<string, number> = {};
  for (const policy of policies) {
    const values = cells.map((c) => c.regretB[policy] ?? 0);
    meanRegret[policy] = mean(values);
    stdRegret[policy] = stdev(values);
  }
  return { mean: meanRegret, std: stdRegret, bySeed: cells };
}

export function assessConfusion(meanA: number, stdA: number, meanB: number, stdB: number, n: number): { t: number; significantlyDifferent: boolean } {
  const nValues = Math.max(n, 2);
  const denom = Math.sqrt((stdA * stdA + stdB * stdB) / nValues);
  if (denom === 0) {
    return { t: meanA === meanB ? 0 : Number.POSITIVE_INFINITY, significantlyDifferent: meanA !== meanB };
  }
  const t = (meanA - meanB) / denom;
  return { t, significantlyDifferent: Math.abs(t) > 1.96 };
}

export function assessSignificantlyDifferent(meanA: number, stdA: number, meanB: number, stdB: number, n: number): { t: number; significantlyDifferent: boolean } {
  return assessConfusion(meanA, stdA, meanB, stdB, n);
}
