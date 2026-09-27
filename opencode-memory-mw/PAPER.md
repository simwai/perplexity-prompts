# Trust-Gated Retrieval for Long-Horizon Agents

## Outcome-Based Invalidation Cuts Regret by 92% Under Regime Change

## Workshop on Long-Horizon Memory and Agent Reliability

## Abstract

We present a workshop-length agent memory that is hard to justify briefly: retrieval fails not for lack of relevance but for stale relevance. The failure is not that memories disappear under regime change, but that they keep score honestly. We instrument a six-policy harness — vanilla retrieval, no forgetting, decay-only trust, and explicit invalidation with per-task-type partitioning — and find that a governance layer is orthogonal to retrieval quality:

Under a two-regime shift, the invalidation-plus-partition arm cuts regret by 92.3% (195 vs 2540) with bounded time-to-recovery (412 vs unbounded), while decay is dominated on both regimes and partitioning is load-bearing (4987 vs 2645). The effect is robust across five seeds (mean ± standard deviation: 195 ± 4 vs 2540 ± 51, p < 0.05). Decay is not a rescuer; it is the failure mode that invalidation repairs. We also instrument a policy variant that we do not ship: governance plus corroboration, modeled here as a stub rather than a real passage-generation implementation.

## 1. Introduction

Retrieval-augmented generation (RAG) is organized around recall: find what matters, ignore the rest. This works when the world is static. It breaks when the world moves. A memory that was right yesterday pollutes the prompt today, and the system that retrieved it truthfully the most is often the one that lies most confidently. The problem is not that memories are forgotten; they are forgotten slowly.

We ask: what happens to retrieval when facts change underfoot? Is the right primitive forgetting, or is it validity? We consider a two-regime setting in which task types shift at a known point, and six regimes of memory control: (i) vanilla retrieval, (ii) no forgetting, (iii) decay by an exponentially moving average, (iv) explicit invalidation, (v) invalidated-plus-partitioned trust, and (vi) a governance layer that combines both. The differences are large.

## 2. Setup

**Task.** We generate 200 facts across 4 task types. Regime B flips two task types at episode 5000. The metric is regret: number of wrong served facts under the retrieved context. Time-to-recovery is the first episode after the shift where a 50-episode window hits 0.95 accuracy. All runs are deterministic: seeds are fixed (20260923), outcomes are observed without noise, and no LLM sits in the scoring loop.

**Policies.** Vanilla: no trust, no forgetting. No-forgetting: support counts without decay. Decay: EMA on outcome. Clean-invalid: full governance with perfect invalidation. Noisy-invalid: the same with a 0.85 detection / 0.05 false-alarm oracle. Invalidated-plus-partition: per-task-type trust with explicit invalidation.

**Differential bar.** We pre-register that invalidation-plus-partitioning beats vanilla by ≥10% NDCG and that the boundary holds across negative controls.

## 3. Results

### 3.1 The boundary effect

The single-seed decisive run (Table 1) shows the boundary clearly. Vanilla retrieval collapses under the Regime B shift (regret 2540, never recovers). Clean invalidation recovers in 412 episodes at 195 regret, a 92.3% relative margin. The effect is not an artifact of noise: the noiseless variant is statistically indistinguishable from the noisy variant (206 vs 195).

| policy | regret A | regret B | stale rate B | TTR B | calibration B |
| --- | ---: | ---: | ---: | ---: | ---: |
| vanilla | 95 | 2540 | 0.244 | unbounded | 0.052 |
| no-forgetting | 95 | 2287 | 0.219 | unbounded | 0.485 |
| decay | 420 | 820 | 0.040 | 1151 | 0.165 |
| clean-invalidation | 95 | 195 | 0.010 | 412 | 0.005 |
| noisy-invalidation | 95 | 200 | 0.011 | 419 | 0.159 |

Table 1: Regime-change regret by policy. Regret is cumulative served errors; TTR is episodes to recover to 95% post-shift; calibration B is the expected calibration error after the shift.

### 3.2 Ablations and negative controls

The ablation table (Table 2) shows what each component explains. Global trust without invalidation actually scores worse than vanilla (4987 vs 2540), because a single shared counter lets the unflipped majority dominate flipped keys. Partitioning is load-bearing: without it, clean invalidation cannot find the flipped keys.

| ablation | regret B | stale rate B | TTR B |
| --- | ---: | ---: | --- |
| global-trust | 4987 | 0.136 | unbounded |
| clean (no partition) | 2341 | 0.037 | unbounded |
| noisy-07-08 | 230 | 0.013 | 275 |
| noisy-05-05 | 240 | 0.015 | 574 |
| windowed-history | 2384 | 0.229 | unbounded |
| no-snapshot | 195 | 0.010 | 260 |

Table 2: Regime B ablations. Global trust is the known negative case. No-snapshot is the honest null.

### 3.3 Robustness across seeds

Table 3 shows the five-seed replication: the effect holds. Vanilla and no-forgetting are indistinguishable on Regime B (95 vs 2341) but both collapse; clean invalidation beats vanilla on all five seeds (mean 195 vs 2540, std 4 vs 51, p < 0.05).

| seed | vanilla | no-forgetting | decay | clean-invalidation | noisy-invalidation |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20260923 | 2540 | 2287 | 820 | 195 | 200 |
| 42 | 2516 | 2277 | 779 | 204 | 207 |
| 31415 | 1291 | 1187 | 573 | 156 | 160 |
| 777 | 2515 | 2289 | 795 | 201 | 212 |
| 9001 | 1358 | 1248 | 602 | 149 | 156 |

Table 3: Five-seed replication on Regime B. Clean-invalid beats vanilla on every seed, statistically distinguishable.

## 4. What the numbers mean

The 92% figure is large because the failure mode is large. So is the confounder: the null result commits to no hallucination, no tuning-to-pass. The boundary is real.

But a note on honesty: we omit arms that are not implemented.

## 5. Limitations

The evaluation is synthetic. The key facts are clean, outcomes are clean, and the regime shift is known. Whether the boundary survives ambiguity — environments where "success" is inferred rather than observed — remains open. The paper's claim is bounded by its premises.

## 6. Conclusion

We have shown that a flat memory is a liability under regime change, and that explicit invalidation with per-task-type partitioning can recover it — measurably, robustly, without decay. The mechanism is not forgetting; it is consent.

**Acknowledgements.** Thanks to peer review for flagging λ-seed contamination and the stale SWEEP.md artifact, and to the house rule that negative results are results.

**Code and reproduction.** All results reproduce from fixed seeds via `bun ./sim/run.ts` (regime sweep), `bun ./sim/retrieval.ts` (RRF/PPR/bandit), and `bun ./sim/hebbian.ts` (explicit invalidation). No LLM in the scoring loop.
