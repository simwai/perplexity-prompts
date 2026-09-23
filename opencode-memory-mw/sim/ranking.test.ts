import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ARMS, runBandit } from "./ranking.js";

describe("ranking", () => {
  it("tries every arm and accounts rewards", () => {
    const result = runBandit(20260923);
    assert.ok(result.pulls.keyword > 0 && result.pulls.mw > 0 && result.pulls.recency > 0);
    assert.ok(Number.isFinite(result.cumulative) && Number.isFinite(result.staticKeyword));
    const totalPulls = result.pulls.keyword + result.pulls.mw + result.pulls.recency;
    assert.equal(totalPulls, 200);
  });

  it("reproduces bandit runs on rerun", () => {
    assert.deepEqual(runBandit(11), runBandit(11));
  });

  it("explores every arm instead of locking onto the first", () => {
    const result = runBandit(20260923);
    assert.ok(result.pulls.keyword >= 10 && result.pulls.mw >= 10 && result.pulls.recency >= 10);
  });
});
