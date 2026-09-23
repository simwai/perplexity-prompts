# Ablations — Regime B knockouts

Seed: 20260923 (fixed). Regime B flips task types: beta, delta.
Null results reported, not hidden.

| ablation | regret B | stale rate B | TTR B | note |
| --- | ---: | ---: | ---: | --- |
| global-trust | 4987 | 0.136 | unbounded | single shared counter: unflipped majority dominates flipped keys |
| noisy-07-08 | 230 | 0.013 | 275 | oracle at 0.7 detect / 0.2 false-alarm |
| noisy-05-05 | 240 | 0.015 | 574 | oracle at chance: invalidation carries no signal |
| windowed-history | 2384 | 0.229 | unbounded | last-500 outcomes per key, no cross-shift memory |
| no-snapshot | 195 | 0.010 | 260 | mw_before snapshot discarded: identical regret by construction (null) |

