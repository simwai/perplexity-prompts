import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runSeedSweep } from "./sweep.js";

describe("seed-sweep", () => {
  it("all policies reproduce per-seed", () => {
    const seeds = [1, 2];
    const first = runSeedSweep(seeds);
    const second = runSeedSweep(seeds);
    assert.deepEqual(first.bySeed.map((c) => c.regretB), second.bySeed.map((c) => c.regretB));
  });

  it("summary statistics are finite for five seeds", () => {
    const sweep = runSeedSweep([20260923, 42, 31415, 777, 9001]);
    for (const policy of ["vanilla", "clean-invalidation"]) {
      assert.ok(Number.isFinite(sweep.mean[policy]));
      assert.ok(Number.isFinite(sweep.std[policy]));
      assert.ok(sweep.mean[policy] ?? 0 > 0);
    }
  });
});
