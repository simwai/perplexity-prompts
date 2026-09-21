# opencode-memory-mw/sim

Simulation harness for the memory-worth plugin v4.2 governance layer.

## Structure

- `regimes.ts` -- simulation regimes (nominal, watch, degraded, quarantine)
- `policies.ts` -- governance policy decisions per regime
- `oracle.ts` -- expected outcome computation for validation
- `metrics.ts` -- trust stability metrics

## Usage

Run inside the `opencode-memory-mw/` directory with Node.js or Bun:

```bash
node --test sim/**/*.test.ts
bun --test sim/**/*.test.ts
```

## Purpose

The sim harness validates that trust scoring, governance policies, and regime detection behave correctly across synthetic outcome sequences. It is a separate Node-only package to keep the plugin itself runtime-agnostic.
