import { createSeededRandom } from "../../.opencode/plugins/memory-worth/core/prng.js";

export const HEBBIAN_RATE = 0.1;
export const PAIRS = 10;
export const STEPS = 200;
export const REMAP_AT = 100;
export const EXPLORE_EPSILON = 0.1;

export type EdgeWeights = Map<string, number>;

function pairKey(a: number, b: number): string {
  return a < b ? `${a}>${b}` : `${b}>${a}`;
}

export function applyHebbian(weights: EdgeWeights, a: number, b: number, outcome: boolean, rate = HEBBIAN_RATE): EdgeWeights {
  const next = new Map(weights);
  const key = pairKey(a, b);
  const current = next.get(key) ?? 0;
  next.set(key, outcome ? current + rate * (1 - current) : current - rate * current);
  return next;
}

export function boostedRank(candidates: ReadonlyArray<number>, base: (id: number) => number, weights: EdgeWeights, coId: number): number[] {
  return [...candidates].sort((x, y) => {
    const bx = base(x) + (weights.get(pairKey(x, coId)) ?? 0);
    const by = base(y) + (weights.get(pairKey(y, coId)) ?? 0);
    return by === bx ? x - y : by - bx;
  });
}

export interface AssociationResult {
  boostedHits: number;
  staticHits: number;
}

export function runAssociationStream(seed: number): AssociationResult {
  const rng = createSeededRandom(seed);
  const partners: number[] = [];
  for (let i = 0; i < PAIRS; i++) {
    partners.push(i);
  }
  const candidates: number[] = [];
  for (let b = 0; b < PAIRS; b++) {
    candidates.push(PAIRS + b);
  }
  const base = (): number => 0;
  let weights: EdgeWeights = new Map();
  let boostedHits = 0;
  let staticHits = 0;
  for (let step = 0; step < STEPS; step++) {
    const presented = Math.floor(rng() * PAIRS);
    const remapped = step >= REMAP_AT;
    const target = remapped ? PAIRS + ((presented + 1) % PAIRS) : PAIRS + presented;
    const ranked = boostedRank(candidates, base, weights, presented);
    // Epsilon exploration: pure-greedy retrieval can never discover a
    // partner it has never co-retrieved, so a fixed exploration rate draws
    // a random candidate instead of the top rank.
    let topPick = ranked[0] ?? -1;
    if (rng() < EXPLORE_EPSILON) {
      topPick = candidates[Math.floor(rng() * candidates.length)] ?? -1;
    }
    const staticTop = boostedRank(candidates, base, new Map(), presented)[0] ?? -1;
    const boostedOk = topPick === target;
    if (boostedOk) boostedHits += 1;
    if (staticTop === target) staticHits += 1;
    weights = applyHebbian(weights, presented, topPick, boostedOk);
  }
  return { boostedHits, staticHits };
}
