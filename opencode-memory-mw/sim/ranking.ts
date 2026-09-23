import { createSeededRandom } from "../../.opencode/plugins/memory-worth/core/prng.js";
import { buildCorpus, keywordRanker, mwRanker, ndcgAt, recencyRanker } from "./retrieval.js";

export const BANDIT_ROUNDS = 200;
export const BANDIT_EPSILON = 0.1;

export type RankerArm = "keyword" | "mw" | "recency";

export const ARMS: RankerArm[] = ["keyword", "mw", "recency"];

export interface BanditResult {
  cumulative: number;
  staticKeyword: number;
  pulls: Record<RankerArm, number>;
}

export function runBandit(seed: number, rounds = BANDIT_ROUNDS, epsilon = BANDIT_EPSILON): BanditResult {
  const rng = createSeededRandom(seed);
  const { docs } = buildCorpus(seed);
  const totals: Record<RankerArm, number> = { keyword: 0, mw: 0, recency: 0 };
  const pulls: Record<RankerArm, number> = { keyword: 0, mw: 0, recency: 0 };
  let cumulative = 0;
  let staticKeyword = 0;
  for (let round = 0; round < rounds; round++) {
    const jitter = Math.floor(rng() * 100000);
    const { query } = buildCorpus(seed + jitter);
    let arm: RankerArm = "keyword";
    if (rng() < epsilon || round < ARMS.length) {
      arm = ARMS[Math.floor(rng() * ARMS.length)] ?? "keyword";
    } else {
      let best: RankerArm = "keyword";
      let bestAvg = -1;
      for (const candidate of ARMS) {
        const avg = pulls[candidate] > 0 ? totals[candidate] / pulls[candidate] : 0;
        if (avg > bestAvg) {
          bestAvg = avg;
          best = candidate;
        }
      }
      arm = best;
    }
    const ranked = arm === "keyword"
      ? keywordRanker(query, docs)
      : arm === "mw"
        ? mwRanker(docs)
        : recencyRanker(docs);
    const reward = ndcgAt(ranked, query.relevant, 10);
    totals[arm] += reward;
    pulls[arm] += 1;
    cumulative += reward;
    staticKeyword += ndcgAt(keywordRanker(query, docs), query.relevant, 10);
  }
  return { cumulative, staticKeyword, pulls };
}
