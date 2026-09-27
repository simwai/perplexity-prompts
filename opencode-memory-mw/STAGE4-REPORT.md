# Stage 4 Report — Decisive Experiment

Seed: 20260923 (fixed; reruns reproduce every number below).
Episodes: 10000 per regime; Regime B shifts at episode 5000; keys: 200.
Decay lambda from Regime-A sweep: 0.2.
Caveats: synthetic keyed facts, clean outcome observation, exploratory constants; no LLM in the loop.

| policy | regret A | regret B | stale rate B | TTR B | calibration B |
| --- | ---: | ---: | ---: | ---: | ---: |
| vanilla | 95 | 2540 | 0.244 | unbounded | 0.052 |
| no-forgetting | 95 | 2287 | 0.219 | unbounded | 0.485 |
| decay | 420 | 820 | 0.040 | 1151 | 0.165 |
| clean-invalidation | 95 | 195 | 0.010 | 412 | 0.005 |
| noisy-invalidation | 95 | 200 | 0.011 | 419 | 0.159 |

Verdict: BOUNDARY
Rationale: clean-invalidation regret 195 vs vanilla 2540 (margin 92.3%), recovery in 412 episodes
