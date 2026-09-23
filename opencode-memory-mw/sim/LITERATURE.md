# Literature — three closest papers (all opened in full)

Searches run per brief §1.6 item 7: agent memory decay, memory invalidation,
regime change continual learning, memory trust signal, RAG under distribution
shift. What follows cites only pages opened and read. Other candidates seen
as snippets only (Trust-RAG Compass, TRUSTMEM, RAG Collapse, STALE/CUPMem,
FadeMem, Selective Forgetting) are not cited as read.

## Paper 1

TEPA: Revoking Stale Memories for Conflict-Robust Language Agents —
<https://arxiv.org/html/2608.07429v2> — opened and read (abstract, mechanism,
evaluation).

Closest to our governance layer and decisive-experiment design. Keyed
precedents with explicit lifecycle states (active/revoked) plus support and
conflict counts map directly onto our grounds-plus-status model and the
s_plus/s_minus counters. Hidden-regime drift over 50 seeds with append-only,
last-write-wins, and no-memory baselines is the template for our Regime B,
including the pollution index (memory worse than no memory: 0.210 vs 0.309
under full reversal) and the revoked-history-kept-for-audit rule we also
adopt. TEPA-Full trial validation parallels our grounds-verification idea.

## Paper 2

Temporal Validity in Retrieval Memory (MemStrata) —
<https://arxiv.org/html/2606.26511> — opened and read (abstract, impossibility
result, supersession mechanism, benchmarks).

Closest to invalidation-as-observation and our honesty requirements.
Deterministic (subject, relation, object) supersession with no similarity
threshold and no LLM on the read path is the strongest form of our
write-time-constraints principle, and the AUROC 0.59 impossibility result for
separating contradictions from duplicates justifies refusing similarity-based
staleness detection. Stale-fact-error rate (RAG 15–40%, MemStrata ~0%) is the
metric shape our stale-retrieval rate should imitate.

## Paper 3

Oblivion: Self-Adaptive Agentic Memory Control through Decay-Driven
Activation — <https://arxiv.org/html/2604.00131v3> — opened and read
(abstract, read/write decoupling, retention dynamics, evaluation).

Closest to decay design, with one honest tension: Oblivion casts forgetting
as decay-driven accessibility loss with an Ebbinghaus retention score and a
decay-temperature knob, while our spec forbids wall-clock decay and decay
knobs, requiring observation-driven invalidation instead. Adopt the
read/write decoupling (uncertainty-gated read path, contribution-reinforced
write path) and the never-delete-latent principle; reject the clock. The
temperature sensitivity analysis is still useful as the cautionary tale for
why our invalidation threshold must be evidence-driven.
