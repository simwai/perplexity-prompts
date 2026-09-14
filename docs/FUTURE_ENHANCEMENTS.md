# Future Enhancements

This file records features that were removed from the active prompt system
but may be re-added when the hosting platform supports the required runtime
capabilities.

## Removed: Parallel Workflow Features

Removed in the current cycle to reduce protocol complexity and surface area.
All concurrency-control mechanisms were preserved; only the parallel
execution paths were removed.

| Feature | Removed From | Why Removed |
|---|---|---|
| `DOCS_PARALLEL` | `prompt-system/00-system.md`, `03-output-and-state.md`, `07-protocols.md` | Requires concurrent subagent spawning across dependency types |
| `PARALLEL_REVIEW` | `prompt-system/00-system.md`, `01-personas.md`, `03-output-and-state.md`, `07-protocols.md` | Requires N concurrent reviewers + BabaTester with partitioned state |
| Combined parallel branch | `prompt-system/00-system.md` | Requires both DOCS_PARALLEL and PARALLEL_REVIEW |
| `[P]` parallel flag | `prompt-system/03-output-and-state.md`, `07-protocols.md` | Requires parallel task execution in separate sessions |
| PATCH test parallelization | `prompt-system/06-misc.md`, `07-protocols.md`, `.opencode/agents/build.md` | Requires isolated-suite detection and concurrent test execution |
| `parallel_budget` fields | `prompt-system/03-output-and-state.md` | Only meaningful when parallel execution is active |

## Re-enablement Condition

These features may be re-added when **OpenCode exposes a parallel subagent
spawning API** with all of the following:

1. **Concurrent spawn**: the main agent can launch N subagents in parallel
   from a single turn, not just delegate sequentially.
2. **Partitioned session state**: each subagent gets its own state section
   (`## Sensei State {n}`, `## Tester State`) without clobbering other
   partitions or the main state.
3. **Timeout and cancellation**: the runtime enforces per-subagent timeouts
   and propagates cancellation to the main agent.
4. **Merge protocol support**: the runtime provides structured result
   aggregation (or the agent layer implements it reliably) so findings from
   N subagents can be combined under documented authority rules
   (Sensei authority on hard-tier, union on soft-tier).
5. **Deterministic sequencing**: lint + typecheck remain strictly sequential
   before any parallel test or review work begins.

Until OpenCode ships these capabilities, the active workflow is strictly
sequential: `CHECKLIST -> DOCS -> REVIEW -> PLAN -> PATCH`.

## Concurrency Control Preserved

The following mechanisms remain active and are unaffected by this removal:

- Session file locks (per-file `.session-locks/*.lock`)
- Dependency locks (depth-1 graph: importers + imports)
- Wait/surface/override-steal contention model
- TTL-based stale lock detection (30 minutes)
- Commit/push gate lock verification

## OpenCode Capability Gap

As of the removal date, OpenCode's `.opencode/` layer supports:

- **Subagent registration**: personas declared in `.opencode/agents/*.md` with `mode: subagent`
- **Sequential delegation**: main agents (`plan.md`, `build.md`) reference subagents by name and are expected to invoke them one at a time
- **Step budgets and permissions**: per-subagent `steps` caps and `edit`/`bash` deny lists

What is **missing** for parallel feature re-enablement:

- **No parallel spawn API**: there is no mechanism to launch N subagents concurrently from a single turn
- **No partitioned state isolation**: no built-in way to give each subagent its own `## Sensei State {n}` section without manual orchestration
- **No timeout/cancellation propagation**: no runtime-level per-subagent timeouts with cancellation
- **No structured merge protocol**: no runtime support for aggregating findings from N concurrent reviewers under documented authority rules

## Restoration Checklist

When OpenCode adds the required capabilities, restore the following:

- [ ] Add `DOCS_PARALLEL` and `PARALLEL_REVIEW` phases back to `00-system.md` phase set
- [ ] Add parallel branches back to `00-system.md` phase order
- [ ] Add parallel transition rules back to `00-system.md` transition rules
- [ ] Restore `DOCS_PARALLEL` template in `03-output-and-state.md`
- [ ] Restore `PARALLEL_REVIEW` template in `03-output-and-state.md`
- [ ] Restore `parallel_budget` in session state schema
- [ ] Restore `## Sensei State 1..N` and `## Tester State` in session state schema
- [ ] Restore `[P]` parallel flag in TASK_PLAN template
- [ ] Restore `Parallel groups` line in PATCH verification template
- [ ] Restore REVIEW Merge Protocol in `07-protocols.md`
- [ ] Restore DOCS Parallel Protocol in `07-protocols.md`
- [ ] Restore PATCH Test Parallelization Protocol in `07-protocols.md`
- [ ] Restore `[P]` parallel flag in task-card enrichment rules
- [ ] Restore parallel references in `01-personas.md` (session flow, BabaReviewer, multi-persona session order, handoff)
- [ ] Restore parallel references in adapter files (`.opencode/agents/*.md`, `.claude/agents/*.md`)
- [ ] Update `generate-adapters.ps1` if needed for any new phase templates
- [ ] Run `generate-adapters.ps1` to regenerate `.claude/`, `.mcp.json`, `.codex/`
