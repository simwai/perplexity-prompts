---
description: Toggle multi-model consensus mode (self-critique plus judge merge over auto-discovered Kilo models) for text-only turns.
---

Toggle consensus mode via $ARGUMENTS (`on`, `off`, or empty for status).

When on, text-only turns (no tool calls) run `consensus_review`: two auto-discovered models self-critique the draft in parallel, then a judge model merges into the final answer. Models are discovered from the Kilo gateway catalog per `CONSENSUS_FAMILIES` (default `nemotron,glm,step`); without `KILO_API_KEY` only free models qualify, with the key paid models in those families join the pool under `CONSENSUS_MAX_PROMPT_PRICE`. Tool-call turns pass through untouched. Web research on disagreement is not live yet: the judge surfaces both views labeled instead of guessing.
