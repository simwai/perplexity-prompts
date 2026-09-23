import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCorpus, keywordRanker, mwRanker, ndcgAt, recencyRanker, rrfFuse } from "./retrieval.js";

const SEED = 20260923;

describe("rrf", () => {
  it("beats keyword-only by at least five NDCG points", () => {
    const { docs, query } = buildCorpus(SEED);
    const keyword = ndcgAt(keywordRanker(query, docs), query.relevant, 10);
    const fused = ndcgAt(rrfFuse([keywordRanker(query, docs), mwRanker(docs), recencyRanker(docs)]), query.relevant, 10);
    assert.ok(fused >= keyword + 0.05, `fused ${fused} vs keyword ${keyword}`);
  });

  it("reproduces fusion order on rerun", () => {
    const first = buildCorpus(SEED);
    const second = buildCorpus(SEED);
    assert.deepEqual(
      rrfFuse([keywordRanker(first.query, first.docs)]),
      rrfFuse([keywordRanker(second.query, second.docs)]),
    );
  });
});
