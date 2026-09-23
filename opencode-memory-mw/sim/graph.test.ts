import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { breadthFirst, buildGraph, personalizedPageRank, recallAt, relevantSet } from "./graph.js";

const SEED = 20260923;

describe("ppr", () => {
  it("beats BFS recall at 2000 nodes", () => {
    const graph = buildGraph(SEED);
    const query = 7;
    const relevant = relevantSet(graph, query);
    const bfs = recallAt(breadthFirst(graph, query, 100), relevant, 100);
    const ppr = recallAt(personalizedPageRank(graph, query), relevant, 100);
    assert.ok(ppr > bfs, `ppr ${ppr} vs bfs ${bfs}`);
  });

  it("reproduces rankings on rerun", () => {
    const first = buildGraph(SEED);
    const second = buildGraph(SEED);
    assert.deepEqual(personalizedPageRank(first, 7).slice(0, 20), personalizedPageRank(second, 7).slice(0, 20));
  });
});
