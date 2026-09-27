# Ablations — Regime B knockouts

Seed: 20260923 (fixed). Regime B flips task types: alpha, delta.
Null results reported, not hidden.

| ablation | regret B | stale rate B | TTR B | note |
| --- | ---: | ---: | ---: | --- |
| global-trust | 4880 | 0.131 | unbounded | single shared counter: unflipped majority dominates flipped keys |
| noisy-07-08 | 227 | 0.013 | 469 | oracle at 0.7 detect / 0.2 false-alarm |
| noisy-05-05 | 240 | 0.015 | 421 | oracle at chance: invalidation carries no signal |
| windowed-history | 2287 | 0.219 | unbounded | last-500 outcomes per key, no cross-shift memory |
| no-snapshot | 195 | 0.010 | 412 | mw_before snapshot discarded: identical regret by construction (null) |

Oracle precision 0.9 / recall 0.95.
