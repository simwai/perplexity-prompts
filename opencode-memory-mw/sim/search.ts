import { createSeededRandom } from "../../.opencode/plugins/memory-worth/core/prng.js";
import { EPISODES, runPolicy } from "./experiment.js";

export const SEARCH_SAMPLES = 128;
export const SEARCH_SEED = 20260923;

export interface ConfigCandidate {
  lambda: number;
  noiseDetect: number;
  noiseFalseAlarm: number;
  trustQ: number;
}

export interface FrontierPoint {
  config: ConfigCandidate;
  regretB: number;
  staleB: number;
}

function sampleConfig(rng: () => number): ConfigCandidate {
  return {
    lambda: 0.02 + rng() * 0.28,
    noiseDetect: 0.5 + rng() * 0.45,
    noiseFalseAlarm: rng() * 0.4,
    trustQ: 0.5 + rng() * 0.45,
  };
}

function dominates(a: FrontierPoint, b: FrontierPoint): boolean {
  const noWorse = a.regretB <= b.regretB && a.staleB <= b.staleB;
  const strictlyBetter = a.regretB < b.regretB || a.staleB < b.staleB;
  return noWorse && strictlyBetter;
}

export function paretoFrontier(points: FrontierPoint[]): FrontierPoint[] {
  const out: FrontierPoint[] = [];
  for (const candidate of points) {
    let dominated = false;
    for (const other of points) {
      if (other === candidate) continue;
      if (dominates(other, candidate)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) out.push(candidate);
  }
  return out.sort((a, b) => a.regretB - b.regretB);
}

export function randomSearch(seed: number, samples = SEARCH_SAMPLES): { candidates: FrontierPoint[]; frontier: FrontierPoint[] } {
  const rng = createSeededRandom(seed);
  const candidates: FrontierPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const config = sampleConfig(rng);
    const run = runPolicy("noisy-invalidation", "B", seed, config.lambda, { detect: config.noiseDetect, falseAlarm: config.noiseFalseAlarm });
    candidates.push({ config, regretB: run.regret, staleB: run.stale / EPISODES });
  }
  return { candidates, frontier: paretoFrontier(candidates) };
}
