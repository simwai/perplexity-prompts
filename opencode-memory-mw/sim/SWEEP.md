# Seed Sweep — Five-Seed Replication

Seeds: 20260923, 42, 31415, 777, 9001. Same decisive harness, same fixed constants. Confidence check uses a t-like statistic at the 1.96 threshold against vanilla.

| policy | regret B mean | regret B std | beats baseline (vanilla) |
| --- | ---: | ---: | --- |
| vanilla | 2589 | 51 | baseline |
| no-forgetting | 2341 | 37 | yes |
| decay | 2213 | 25 | yes |
| clean-invalidation | 201 | 4 | yes |
| noisy-invalidation | 209 | 3 | yes |

Verdict: BOUNDARY HOLDS ACROSS SEEDS.
