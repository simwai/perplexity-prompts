# Seed Sweep — Five-Seed Replication

Seeds: 20260923, 42, 31415, 777, 9001. Same decisive harness, same fixed constants. Confidence check uses a t-like statistic at the 1.96 threshold against vanilla.

| policy | regret B mean | regret B std | beats baseline (vanilla) |
| --- | ---: | ---: | --- |
| vanilla | 2044 | 657 | baseline |
| no-forgetting | 1858 | 585 | no |
| decay | 714 | 117 | yes |
| clean-invalidation | 181 | 26 | yes |
| noisy-invalidation | 187 | 27 | yes |

Verdict: BOUNDARY HOLDS ACROSS SEEDS.
