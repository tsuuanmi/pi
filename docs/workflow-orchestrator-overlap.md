# Workflow and Orchestrator Overlap

This document audits where `@tsuuanmi/pi-workflows` overlaps with `@tsuuanmi/pi-orchestrator` and records what should move, stay, or remain under review. See [`receipt-boundaries.md`](./receipt-boundaries.md) for receipt ownership rules, [`persistence-boundaries.md`](./persistence-boundaries.md) for state ownership rules, [`team-workflow-orchestrator-adapter.md`](./team-workflow-orchestrator-adapter.md) for the team adapter boundary, and [`team-workflow-orchestrator-runtime.md`](./team-workflow-orchestrator-runtime.md) for the runtime contract.

## Boundary rule

- `@tsuuanmi/pi-orchestrator` owns generic task DAG execution over runtime `Agent`s.
- `@tsuuanmi/pi-workflows` owns named Pi workflow UX, state, gates, artifacts, and command/tool control planes.
- `@tsuuanmi/pi-workflows` may import `@tsuuanmi/pi-orchestrator` only through workflow-owned adapters when a workflow needs generic DAG/team execution.
- `@tsuuanmi/pi-orchestrator` must not import workflows.
- `@tsuuanmi/pi-workflows` must not import `@tsuuanmi/pi` or `@tsuuanmi/pi/*`.
- Integration code must reject unsupported shapes instead of adding fallback, alias, or compatibility paths.

## Summary table

| Workflow area | Current behavior | Overlap | Decision | ROI | Next action |
| --- | --- | --- | --- | --- | --- |
| `team` | Persists team tasks, workers, gates, mailbox, and delegates all role execution to Orchestrator | Task queue, team roster, routing, events, receipts | Keep workflow state/gates; use Orchestrator as the sole multi-agent execution engine | High | Complete dependency-semantic and recovery parity coverage |
| `ultragoal` | Persists approved goals, checkpoints, quality gates, blockers, ledger, and completion receipts | Task/goal state, checkpoints, receipts, progress | Keep workflow-owned goal UX and gates; direct manager use is limited to one guarded worker; use the orchestrator only for a real multi-goal DAG | Medium-high | Remove legacy writes, then audit goal dependency semantics before any code move |
| `ralplan` | Produces pending-approval plans through role-agent stages, verdicts, obstacles, approval handoff | Planning, role sequencing, artifacts | Keep workflow-owned; do not move to orchestrator | Medium | Document handoff outputs that can become orchestrator task inputs |
| `deep-interview` | Runs requirements interview, ambiguity scoring, closure guard, spec writing | None significant | Keep workflow-owned | Low | No orchestrator integration |
| Workflow runtime | Owns session state, leases, RPC, GC, mutation queues, storage layout | Checkpoint/recovery concepts | Keep workflow-owned; may implement orchestrator checkpoint stores | High | Keep checkpoint/event stores workflow-owned |

## Detailed findings

### Team workflow

`packages/workflows/src/skills/team/team-runtime.ts` defines workflow-specific team state:

- `TeamConfig`
- `TeamWorker`
- `TeamTask`
- review/completion gates
- mailbox and event files
- workflow HUD state

`packages/workflows/src/skills/team/team-tools.ts` selects guarded worker, reviewer, and prover roles, then submits each role batch to the orchestrator. These are workflow policy roles, not generic `orchestrator.Team` agents.

Decision:

- Keep workflow-owned task state because it includes review gates, completion evidence, mailbox state, HUD state, and workflow artifacts.
- Use `Orchestrator` for every role execution loop; workflow submits only the legally selected role task with runtime `Agent`s and `TaskRequirements`.
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
- guarded role order
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

| Rank | Task | ROI | Status | Exit criteria |
| ---: | --- | --- | --- | --- |
| 1 | Audit Team dependency and recovery semantics against `TaskQueue` | High | Next | `depends_on` has one mapping, `blocked_by` has one owner, and resume/recovery parity passes |
| 2 | Remove Ultragoal legacy and dual-write paths | High | Planned | Obstacle, review-blocker, quality-gate, and receipt writes have one canonical path |
| 3 | Complete package-level receipt boundary documentation | Medium-high | Planned | Workflow receipts reference task IDs without copying task receipt schemas |
| 4 | Complete checkpoint recovery parity tests | Medium-high | Planned | Restart, duplicate event, interrupted task, and checkpoint-save failure cases are covered |
| 5 | Normalize event ownership and adapter documentation | Medium | Planned | Agent, queue, workflow, and Pi UI events have explicit owners and mappings |
| 6 | Define approved Ralplan output adapters | Medium-low | Planned | Approved plans map into downstream task inputs without moving planning policy |
| 7 | Evaluate Ultragoal orchestrator integration only for a real DAG | Low-medium | Decision gate | No adapter is added without independent goals and generic dependencies |
| 8 | Keep Ralplan and Deep-interview workflow-owned | Low | Guardrail | No code movement unless a concrete generic DAG requirement appears |

## Direct manager exception

Workflow code may call `SubagentManager` directly only when the operation controls one subagent or runs one workflow-owned worker. The allowed adapters are `subagents/subagent-tools.ts`, `skills/team/agent-adapter.ts`, `skills/ralplan/ralplan-agents.ts`, and `skills/ultragoal/ultragoal-tools.ts`. A workflow must use the orchestrator for task dependencies, agent assignment, retries, queue execution, or agent collaboration. Unknown manager call sites fail the package boundary check.

## Adapter acceptance criteria

Any workflow-to-orchestrator adapter must satisfy:

1. It lives in `@tsuuanmi/pi-workflows`.
2. It imports `@tsuuanmi/pi-orchestrator`; orchestrator imports nothing from workflows.
3. It maps workflow state to orchestrator `TaskInput` without exposing workflow internals to orchestrator.
4. It maps queue events back to workflow-owned events/HUD state.
5. It stores checkpoints through a workflow-owned `OrchestratorCheckpointStore` implementation.
6. It records workflow receipts that reference orchestrator task receipt ids instead of copying task receipt schema.
7. It preserves workflow gates as workflow-owned policy.

## Remaining runtime work

The adapter, explicit role coordinator, fresh/resume tools, failure persistence, and idempotent event store are implemented. Remaining work is session-isolation hardening, dependency/recovery parity, and removal of workflow compatibility paths. Do not integrate it into ultragoal, ralplan, or deep-interview without a separate DAG requirement.
