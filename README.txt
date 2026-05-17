# Prompt System

This is the phase-oriented txt bundle.
It replaces step-wise drift control with one hard response template per phase.

Core idea:
- phase-wise control, not per-step micro-headers
- one allowed template per phase
- fail closed into `BLOCKED`
- terminate into `FAILURE` after repeated drift
- keep transition criteria embedded in the files that own them

Important modules:
- `02-workflow.txt` — phase model and global enforcement rules
- `07-output-contracts.txt` — one response template per phase plus phase unlock conditions
- `10-decision-and-intake.txt` — blocked-state and per-phase unblock requirements
- `11-state-machine.txt` — legal phase transitions with embedded allowed-only-if rules
- `12-module-routing.txt` — phase-wise loading model
- `14-implementation-style.txt` — coding-style defaults for BabaDev

Personas:
- `personas/babasensei.txt` — Planning Lead and Scope Guardian
- `personas/babatester.txt` — Test Strategy Lead and Risk Hunter
- `personas/baba-dev.txt` — Senior Implementation Lead (formerly Guided Senior Dev)
- `personas/baba-reviewer.txt` — Review Master and Quality Gate

Role ownership map: see `role-legend.md`
