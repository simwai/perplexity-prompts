import { createSeededRandom } from "../../.opencode/plugins/memory-worth/core/prng.js";

export const NODES = 2000;
export const TOPICS = 20;
export const DAMPING = 0.85;
export const ITERATIONS = 50;

export interface Graph {
  adjacency: Map<number, number[]>;
  topicOf: (id: number) => number;
}

export function buildGraph(seed: number, nodes = NODES, topics = TOPICS): Graph {
  const rng = createSeededRandom(seed);
  const adjacency = new Map<number, number[]>();
  for (let id = 0; id < nodes; id++) {
    adjacency.set(id, []);
  }
  const topicOf = (id: number): number => id % topics;
  for (let id = 0; id < nodes; id++) {
    const neighbors = adjacency.get(id) ?? [];
    for (let e = 0; e < 4; e++) {
      const sameTopic = Math.floor(rng() * (nodes / topics)) * topics + topicOf(id);
      if (sameTopic !== id && sameTopic < nodes && !neighbors.includes(sameTopic)) {
        neighbors.push(sameTopic);
      }
    }
    for (let e = 0; e < 2; e++) {
      const anywhere = Math.floor(rng() * nodes);
      if (anywhere !== id && !neighbors.includes(anywhere)) {
        neighbors.push(anywhere);
      }
    }
  }
  return { adjacency, topicOf };
}

export function relevantSet(graph: Graph, query: number, nodes = NODES): number[] {
  const topic = graph.topicOf(query);
  const out: number[] = [];
  for (let id = 0; id < nodes; id++) {
    if (id !== query && graph.topicOf(id) === topic) out.push(id);
  }
  return out;
}

export function breadthFirst(graph: Graph, query: number, limit: number): number[] {
  const seen = new Set<number>([query]);
  const queue: number[] = [query];
  const order: number[] = [];
  while (queue.length > 0 && order.length < limit) {
    const current = queue.shift();
    if (current === undefined) break;
    if (current !== query) order.push(current);
    const neighbors = graph.adjacency.get(current) ?? [];
    for (const next of neighbors) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return order;
}

export function personalizedPageRank(graph: Graph, query: number, nodes = NODES, iterations = ITERATIONS): number[] {
  const scores = new Array<number>(nodes).fill(0);
  scores[query] = 1;
  for (let step = 0; step < iterations; step++) {
    const next = new Array<number>(nodes).fill(0);
    if (query >= 0 && query < nodes) next[query] = 1 - DAMPING;
    for (let id = 0; id < nodes; id++) {
      const neighbors = graph.adjacency.get(id) ?? [];
      if (neighbors.length === 0) continue;
      const share = (DAMPING * (scores[id] ?? 0)) / neighbors.length;
      for (const target of neighbors) {
        next[target] = (next[target] ?? 0) + share;
      }
    }
    for (let id = 0; id < nodes; id++) {
      scores[id] = next[id] ?? 0;
    }
  }
  const ranked: number[] = [];
  for (let id = 0; id < nodes; id++) {
    if (id !== query) ranked.push(id);
  }
  ranked.sort((a, b) => {
    const diff = (scores[b] ?? 0) - (scores[a] ?? 0);
    return diff === 0 ? a - b : diff;
  });
  return ranked;
}

export function recallAt(ranked: number[], relevant: ReadonlyArray<number>, k: number): number {
  if (relevant.length === 0) return 0;
  const rel = new Set(relevant);
  let hits = 0;
  for (const id of ranked.slice(0, k)) {
    if (rel.has(id)) hits += 1;
  }
  return hits / Math.min(k, relevant.length);
}
