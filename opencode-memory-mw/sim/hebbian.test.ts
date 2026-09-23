import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyHebbian, boostedRank, runAssociationStream } from "./hebbian.js";

describe("hebbian", () => {
  it("strengthens co-active edges and weakens failing ones", () => {
    const empty = new Map<string, number>();
    const grown = applyHebbian(applyHebbian(empty, 1, 2, true), 1, 2, true);
    const shrunk = applyHebbian(grown, 1, 2, false);
    assert.ok((grown.get("1>2") ?? 0) > (shrunk.get("1>2") ?? 0));
  });

  it("beats static weights across a Regime-B style remap", () => {
    const result = runAssociationStream(20260923);
    assert.ok(result.boostedHits > result.staticHits, `boosted ${result.boostedHits} vs static ${result.staticHits}`);
  });

  it("reproduces the stream on rerun", () => {
    assert.deepEqual(runAssociationStream(7), runAssociationStream(7));
  });
});
