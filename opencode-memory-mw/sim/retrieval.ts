import { createSeededRandom } from "../../.opencode/plugins/memory-worth/core/prng.js";

export interface Doc {
  id: number;
  tokens: string[];
  mw: number;
  updated: number;
}

export interface Query {
  terms: string[];
  relevant: number[];
}

export const RRF_K = 60;

export function buildCorpus(seed: number, docs = 500, vocab = 120, relevant = 10): { docs: Doc[]; query: Query } {
  const rng = createSeededRandom(seed);
  const terms: string[] = [];
  for (let i = 0; i < vocab; i++) {
    terms.push(`t${i}`);
  }
  const queryTerms = [terms[0] ?? "t0", terms[1] ?? "t1", terms[2] ?? "t2", terms[3] ?? "t3"];
  const pick = (n: number): string => terms[Math.floor(rng() * terms.length)] ?? "t0";
  const documents: Doc[] = [];
  for (let id = 0; id < docs; id++) {
    documents.push({ id, tokens: [], mw: 0.05 + rng() * 0.65, updated: Math.floor(rng() * 100000) });
  }
  const relevantIds: number[] = [];
  for (let r = 0; r < relevant; r++) {
    const id = r * Math.floor(docs / relevant);
    const shared = r < relevant / 2 ? 3 : 1;
    const tokens: string[] = [];
    for (let s = 0; s < shared; s++) {
      const term = queryTerms[(r + s) % queryTerms.length];
      if (term !== undefined && !tokens.includes(term)) tokens.push(term);
    }
    while (tokens.length < 8) {
      const filler = pick(0);
      if (!tokens.includes(filler)) tokens.push(filler);
    }
    const strong = r < relevant / 2;
    // Recency carries a weak real signal, as recency metadata does in
    // production stacks: relevant docs skew recent without determining it.
    const recent = rng() < 0.7;
    documents[id] = {
      id,
      tokens,
      mw: strong ? 0.5 + rng() * 0.3 : 0.75 + rng() * 0.2,
      updated: recent ? 90000 + Math.floor(rng() * 10000) : Math.floor(rng() * 100000),
    };
    relevantIds.push(id);
  }
  for (let id = 0; id < docs; id++) {
    const doc = documents[id];
    if (!doc || doc.tokens.length > 0) continue;
    const tokens: string[] = [];
    while (tokens.length < 8) {
      const filler = pick(0);
      if (!tokens.includes(filler)) tokens.push(filler);
    }
    documents[id] = { id, tokens, mw: 0.05 + rng() * 0.65, updated: Math.floor(rng() * 100000) };
  }
  return { docs: documents, query: { terms: queryTerms, relevant: relevantIds } };
}

function orderByScore(scores: Map<number, number>): number[] {
  return [...scores.entries()]
    .sort((a, b) => (b[1] === a[1] ? a[0] - b[0] : b[1] - a[1]))
    .map(([id]) => id);
}

export function keywordRanker(query: Query, docs: Doc[]): number[] {
  const scores = new Map<number, number>();
  for (const doc of docs) {
    let overlap = 0;
    for (const term of query.terms) {
      if (doc.tokens.includes(term)) overlap += 1;
    }
    scores.set(doc.id, overlap);
  }
  return orderByScore(scores);
}

export function mwRanker(docs: Doc[]): number[] {
  const scores = new Map<number, number>();
  for (const doc of docs) {
    scores.set(doc.id, doc.mw);
  }
  return orderByScore(scores);
}

export function recencyRanker(docs: Doc[]): number[] {
  const scores = new Map<number, number>();
  for (const doc of docs) {
    scores.set(doc.id, doc.updated);
  }
  return orderByScore(scores);
}

export function rrfFuse(rankings: number[][], k = RRF_K): number[] {
  const scores = new Map<number, number>();
  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const id = ranking[rank];
      if (id === undefined) continue;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return orderByScore(scores);
}

export function ndcgAt(ranked: number[], relevant: ReadonlyArray<number>, k = 10): number {
  const rel = new Set(relevant);
  let dcg = 0;
  const top = ranked.slice(0, k);
  for (let i = 0; i < top.length; i++) {
    if (rel.has(top[i] ?? -1)) dcg += 1 / Math.log2(i + 2);
  }
  let idcg = 0;
  const ideal = Math.min(k, rel.size);
  for (let i = 0; i < ideal; i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg === 0 ? 0 : dcg / idcg;
}
