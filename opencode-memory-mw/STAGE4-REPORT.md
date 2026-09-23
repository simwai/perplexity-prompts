# Stage 4 Report — Decisive Experiment

Seed: 20260923 (fixed; reruns reproduce every number below).
Episodes: 10000 per regime; Regime B shifts at episode 5000; keys: 200.
Decay lambda from Regime-A sweep: 0.05.
Caveats: synthetic keyed facts, clean outcome observation, exploratory constants; no LLM in the loop.

| policy | regret A | regret B | stale rate B | TTR B | calibration B |
| --- | ---: | ---: | ---: | ---: | ---: |
| vanilla | 95 | 2645 | 0.255 | unbounded | 0.054 |
| no-forgetting | 95 | 2384 | 0.229 | unbounded | 0.489 |
| decay | 95 | 1200 | 0.111 | 2584 | 0.133 |
| clean-invalidation | 95 | 195 | 0.010 | 260 | 0.005 |
| noisy-invalidation | 95 | 206 | 0.011 | 275 | 0.177 |
| governance-hyde | 95 | 195 | 0.010 | 260 | 0.005 |

Verdict: BOUNDARY
Rationale: clean-invalidation regret 195 vs vanilla 2645 (margin 92.6%), recovery in 260 episodes
