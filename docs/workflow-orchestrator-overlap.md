# Workflow and Orchestrator Overlap

This document audits where `@tsuuanmi/pi-workflows` overlaps with `@tsuuanmi/pi-orchestrator` and records what should move, stay, or remain under review. See [`receipt-boundaries.md`](./receipt-boundaries.md) for receipt ownership rules, [`persistence-boundaries.md`](./persistence-boundaries.md) for state ownership rules, [`team-workflow-orchestrator-adapter.md`](./team-workflow-orchestrator-adapter.md) for the team adapter design, and [`team-workflow-orchestrator-runtime.md`](./team-workflow-orchestrator-runtime.md) for the feature-gated runtime design.

## Boundary rule

- `@tsuuanmi/pi-orchestrator` owns generic task DAG execution over runtime `Agent`s.
- `@tsuuanmi/pi-workflows` owns named Pi workflow UX, state, gates, artifacts, and command/tool control planes.
- `@tsuuanmi/pi-workflows` may import `@tsuuanmi/pi-orchestrator` when a workflow needs generic DAG/team execution.
- `@tsuuanmi/pi-orchestrator` must not import workflows.
- `@tsuuanmi/pi-workflows` must not import `@tsuuanmi/pi` or `@tsuuanmi/pi/*`.

## Summary table

| Workflow area | Current behavior | Overlap | Decision | ROI | Next action |
| --- | --- | --- | --- | --- | --- |
| `team` | Persists team tasks, workers, gates, mailbox, and spawns worker/reviewer/prover subagents | Task queue, team roster, routing, events, receipts | Keep workflow state/gates; evaluate orchestrator for generic task execution only | High | Design adapter from workflow task state to orchestrator task DAG |
| `ultragoal` | Persists approved goals, checkpoints, quality gates, blockers, ledger, and completion receipts | Task/goal state, checkpoints, receipts, progress | Keep workflow-owned goal UX and gates; consider orchestrator only for multi-goal DAG execution if goals become generic tasks | Medium-high | Audit goal dependency semantics before any code move |
| `ralplan` | Produces pending-approval plans through role-agent stages, verdicts, obstacles, approval handoff | Planning, role sequencing, artifacts | Keep workflow-owned; do not move to orchestrator | Medium | Document handoff outputs that can become orchestrator task inputs |
| `deep-interview` | Runs requirements interview, ambiguity scoring, closure guard, spec writing | None significant | Keep workflow-owned | Low | No orchestrator integration |
| Workflow runtime | Owns session state, leases, RPC, GC, mutation queues, storage layout | Checkpoint/recovery concepts | Keep workflow-owned; may implement orchestrator checkpoint stores | High | Add adapter example only after a workflow uses orchestrator |

## Detailed findings

### Team workflow

`packages/workflows/src/skills/team/team-runtime.ts` defines workflow-specific team state:

- `TeamConfig`
- `TeamWorker`
- `TeamTask`
- review/completion gates
- mailbox and event files
- workflow HUD state

`packages/workflows/src/skills/team/team-tools.ts` spawns guarded subagents for worker, reviewer, and prover roles. These are workflow policy roles, not generic `orchestrator.Team` agents.

Decision:

- Keep workflow-owned task state because it includes review gates, completion evidence, mailbox state, HUD state, and workflow artifacts.
- Consider `Orchestrator` only for the inner generic execution loop when team tasks form a strict DAG and can be assigned to runtime `Agent`s with `TaskRequirements`.
- Do not rename `orchestrator.Team`; instead, document that workflow team state is a workflow skill concept.

Potential adapter:

```text
Workflow TeamTask[]
  -> TaskInput[]
  -> Orchestrator.run(runtime Team, tasks, options)
  -> queue events / receipts
  -> workflow-owned state updates, gates, HUD, artifacts
```

Do not move into orchestrator:

- reviewer/prover gate policy
- team mailbox files
- workflow HUD state
- guarded spawn role order
- workflow artifact paths

### Ultragoal workflow

`packages/workflows/src/skills/ultragoal/ultragoal-runtime.ts` owns goal state, blocker handling, ledger events, quality gates, and checkpoint artifacts. These are user-facing workflow concepts.

Overlap with orchestrator exists around:

- goal statuses vs task statuses
- checkpoint artifacts vs orchestrator checkpoints
- completion receipts vs task receipts
- progress tracking vs queue events

Decision:

- Keep ultragoal-owned goals and quality gates in workflows.
- Do not map every goal to `Task` by default; ultragoal goals include workflow-specific gate and evidence semantics.
- Consider orchestrator only if ultragoal gains explicit multi-agent or dependency-DAG execution for independent goals.

Do not move into orchestrator:

- quality gate validation
- blocker classification
- stale/dirty receipt guard
- user-facing checkpoint artifacts
- ledger event semantics

### Ralplan workflow

`packages/workflows/src/skills/ralplan/ralplan-runtime.ts` owns role-stage planning artifacts, critic verdicts, approval handoff, obstacles, and completion transaction journals.

Overlap with orchestrator is limited to planning terms. Ralplan is not generic task execution; it is a workflow-specific planning and approval process.

Decision:

- Keep ralplan in workflows.
- The output of an approved ralplan plan may become input to team, ultragoal, or a future orchestrator-backed workflow adapter.
- Do not move role-stage sequencing or verdict logic into orchestrator.

Do not move into orchestrator:

- Explorer/Planner/Architect/Critic role order
- critic verdict enforcement
- approval target handoff
- pending-approval artifacts
- completion transaction journal

### Deep-interview workflow

`packages/workflows/src/skills/deep-interview/deep-interview-runtime.ts` owns ambiguity scoring, interview rounds, topology/question state, closure, and spec handoff. This has no meaningful generic task-DAG overlap.

Decision:

- Keep entirely workflow-owned.
- No orchestrator integration.

### Workflow runtime

`packages/workflows/src/runtime` owns workflow execution infrastructure:

- runtime owner lifecycle
- RPC
- leases
- GC
- mutation queues
- state storage
- primitive no-owner paths

Overlap exists only at the concept level with orchestrator checkpoints and recovery. The implementations should remain separate.

Decision:

- Keep workflow runtime storage and owner lifecycle in workflows.
- Workflows may implement `OrchestratorCheckpointStore` when using orchestrator internally.
- Orchestrator must keep checkpoint storage abstract.

## ROI-ranked follow-up tasks

| Rank | Task | ROI | Notes |
| ---: | --- | --- | --- |
| 1 | Write a team-workflow adapter design | Done | Defined in [`team-workflow-orchestrator-adapter.md`](./team-workflow-orchestrator-adapter.md) |
| 2 | Add receipt boundary docs in package docs | High | Clarify tool/task/workflow receipts at package level |
| 3 | Add checkpoint-store adapter example | Medium-high | Workflows can implement `OrchestratorCheckpointStore` without reverse imports |
| 4 | Audit team task dependency fields against `TaskQueue` semantics | Medium-high | `depends_on` and `blocked_by` need strict mapping rules |
| 5 | Audit ultragoal goal dependencies | Medium | Only integrate orchestrator if goals form a real DAG |
| 6 | Add event mapping docs | Medium | Queue events to workflow HUD/events should be adapter-owned |
| 7 | Consider implementing orchestrator inside team workflow | Medium | Only after adapter design is approved |
| 8 | Consider implementing orchestrator inside ultragoal | Low-medium | Only if dependency-DAG goals are required |
| 9 | Keep ralplan/deep-interview workflow-owned | Low | No code movement needed |

## Adapter acceptance criteria

Any workflow-to-orchestrator adapter must satisfy:

1. It lives in `@tsuuanmi/pi-workflows`.
2. It imports `@tsuuanmi/pi-orchestrator`; orchestrator imports nothing from workflows.
3. It maps workflow state to orchestrator `TaskInput` without exposing workflow internals to orchestrator.
4. It maps queue events back to workflow-owned events/HUD state.
5. It stores checkpoints through a workflow-owned `OrchestratorCheckpointStore` implementation.
6. It records workflow receipts that reference orchestrator task receipt ids instead of copying task receipt schema.
7. It preserves workflow gates as workflow-owned policy.

## Do not implement yet

Do not start runtime integration until the team adapter design is written and reviewed. The current priority is boundary clarity and overlap reduction, not moving behavior speculatively.
