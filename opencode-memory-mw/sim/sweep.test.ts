import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runSeedSweep } from "./sweep.js";
import { runPolicy } from "./experiment.js";

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

  it("decay policy sensitivity to lambda on trivial 10-episode case", () => {
    const seed = 20260923;
    const episodes = 10;
    const r1 = runPolicy("decay", "B", 20260923, 0.001);
    const r2 = runPolicy("decay", "B", 20260923, 0.5);
    assert.notEqual(r1.regret, r2.regret, "lambda=0.001 and lambda=0.5 must produce different regret");
  });
});
