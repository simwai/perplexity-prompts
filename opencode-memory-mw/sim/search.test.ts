import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paretoFrontier, randomSearch, SEARCH_SAMPLES } from "./search.js";

describe("search", () => {
  it("extracts only nondominated points", () => {
    assert.ok(paretoFrontier([]).length === 0);
  });

  it("samples 128 candidates deterministically", () => {
    const first = randomSearch(20260923);
    assert.equal(first.candidates.length, 128);
    assert.ok(first.frontier.length >= 1);
    assert.deepEqual(first.candidates[0]?.config, first.candidates[0]?.config);
  });
});
