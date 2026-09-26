# Seed Sweep — Five-Seed Replication

Seeds: 20260923, 42, 31415, 777, 9001. Same decisive harness, same fixed constants. Confidence check uses a t-like statistic at the 1.96 threshold against vanilla. Decay λ sweep on Regime B: 0.005→2245, 0.01→2097, 0.02→1789, 0.05→1200, 0.1→776, 0.2→495, 0.3→295, 0.4→295, 0.5→195, 0.7→195 (floor at clean-invalidation). Optimum: λ≥0.5 = hard reset.

| policy | regret B mean | regret B std | beats baseline (vanilla) |
| --- | ---: | ---: | --- |
| vanilla | 2589 | 51 | baseline |
| no-forgetting | 2341 | 37 | yes |
| decay | 2213 | 25 | yes |
| clean-invalidation | 201 | 4 | yes |
| noisy-invalidation | 209 | 3 | yes |

Verdict: BOUNDARY HOLDS ACROSS SEEDS.
