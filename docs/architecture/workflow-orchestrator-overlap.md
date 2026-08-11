# Workflow and Orchestrator Overlap

This document audits where `@tsuuanmi/pi-workflows` overlaps with `@tsuuanmi/pi-orchestrator` and records what should move, stay, or remain under review. See [`ralplan-orchestrator-contract.md`](./ralplan-orchestrator-contract.md) for the Ralplan adapter contract, [`receipt-boundaries.md`](./receipt-boundaries.md) for receipt ownership rules, [`persistence-boundaries.md`](./persistence-boundaries.md) for state ownership rules, [`team-workflow-orchestrator-adapter.md`](./team-workflow-orchestrator-adapter.md) for the Team adapter boundary, and [`team-workflow-orchestrator-runtime.md`](./team-workflow-orchestrator-runtime.md) for the runtime contract.

## Boundary rule

- `@tsuuanmi/pi-orchestrator` owns generic task DAG execution over runtime `Agent`s.
- `@tsuuanmi/pi-workflows` owns named Pi workflow UX, state, gates, artifacts, and command/tool control planes.
- `@tsuuanmi/pi-workflows` may import `@tsuuanmi/pi-orchestrator` only through workflow-owned adapters when a workflow needs generic DAG/team execution.
- `@tsuuanmi/pi-orchestrator` must not import workflows.
- `@tsuuanmi/pi-workflows` may import published `@tsuuanmi/pi` APIs for session and subagent capabilities, but must not import Pi private `#pi/*` aliases or internal source paths.
- Integration code must reject unsupported shapes instead of adding fallback, alias, or compatibility paths.

## Summary table

| Workflow area | Current behavior | Overlap | Decision | ROI | Next action |
| --- | --- | --- | --- | --- | --- |
| `team` | Persists team tasks, workers, gates, mailbox, and delegates all role execution to Orchestrator | Task queue, team roster, routing, events, receipts | Keep workflow state/gates; use Orchestrator as the sole multi-agent execution engine | High | Maintain strict checkpoint and event parity |
| `ultragoal` | Persists approved goals, checkpoints, quality gates, blockers, ledger, and completion receipts | Task/goal state, checkpoints, receipts, progress | Keep workflow-owned goal UX and gates; direct manager use is limited to one guarded worker; use the orchestrator only for a real multi-goal DAG | Medium-high | Audit goal dependency semantics before any code move |
| `ralplan` | Produces pending-approval plans through guarded role-agent stages, verdicts, obstacles, and approval handoff; executes admitted roles through a workflow-owned adapter | Role execution, checkpoints, receipts, artifacts | Keep workflow policy/state/artifacts in workflows; use Orchestrator for one admitted role task at a time | High | Maintain artifact verification and recovery parity |
| `deep-interview` | Runs requirements interview, ambiguity scoring, closure guard, spec writing | None significant | Keep workflow-owned | Low | No orchestrator integration |
| Workflow runtime | Owns session state, leases, RPC, GC, mutation queues, storage layout | Checkpoint/recovery concepts | Keep workflow-owned; may implement orchestrator checkpoint stores | High | Keep checkpoint/event stores workflow-owned |

## Detailed findings

### Team workflow

`packages/workflows/src/skills/team/runtime.ts` defines workflow-specific team state:

- `TeamConfig`
- `TeamWorker`
- `TeamTask`
- review/completion gates
- mailbox and event files
- workflow HUD state

`packages/workflows/src/skills/team/tools.ts` selects guarded worker, reviewer, and prover roles, then submits each role batch to the orchestrator. These are workflow policy roles, not generic `orchestrator.Team` agents.

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

`packages/workflows/src/skills/ultragoal/runtime.ts` owns goal state, blocker handling, ledger events, quality gates, and checkpoint artifacts. These are user-facing workflow concepts.

Overlap with orchestrator exists around:

- goal statuses vs task statuses
- checkpoint artifacts vs orchestrator checkpoints
- completion receipts vs task receipts
- progress tracking vs queue events

Decision:

- Keep ultragoal-owned goals and quality gates in workflows.
- Do not map every goal to `Task` by default; ultragoal goals include workflow-specific gate and evidence semantics.
- The package-boundary check rejects Orchestrator imports from Ultragoal; revisit only if ultragoal gains explicit multi-agent or dependency-DAG execution for independent goals.

Do not move into orchestrator:

- quality gate validation
- blocker classification
- stale/dirty receipt guard
- user-facing checkpoint artifacts
- ledger event semantics

### Ralplan workflow

`packages/workflows/src/skills/ralplan/runtime.ts` owns role-stage planning artifacts, critic verdicts, approval handoff, obstacles, and completion transaction journals. `orchestrator.ts` submits one guarded role task to `@tsuuanmi/pi-orchestrator` and verifies the workflow artifact before task completion.

The overlap is execution, not policy. Ralplan selects the legal role and stage, while the generic engine invokes the workflow-created runtime Agent, persists its checkpoint, and records its task receipt.

Decision:

- Keep Ralplan role order, verdicts, artifacts, approval, and workflow state in workflows.
- Use the Orchestrator adapter for Explorer, Planner, Architect, Critic, Revision, and Expert role execution.
- Keep revision and expert branches workflow-controlled; do not encode conditional loops as a static engine graph.

Adapter flow:

```text
Ralplan expected-next action
  -> RalplanAgentInput
  -> Orchestrator.run(one TaskInput, one runtime Agent)
  -> artifact/provenance verification
  -> workflow receipt and next-action selection
```

Do not move into orchestrator:

- Explorer/Planner/Architect/Critic role order
- critic verdict enforcement
- approval target handoff
- pending-approval artifacts
- completion transaction journal

### Deep-interview workflow

`packages/workflows/src/skills/deep-interview/runtime.ts` owns ambiguity scoring, interview rounds, topology/question state, closure, and spec handoff. This has no meaningful generic task-DAG overlap.

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
| 1 | Complete Ralplan role execution adapter and artifact barrier | High | Implemented | Every admitted role runs through Orchestrator and cannot complete without its workflow artifact |
| 2 | Audit Team dependency and recovery semantics against `TaskQueue` | High | Implemented | `depends_on` has one mapping, `blocked_by` has one owner, and resume/recovery parity passes |
| 3 | Remove Ultragoal legacy and dual-write paths | High | Implemented | Obstacle, review-blocker, quality-gate, and receipt writes have one canonical path |
| 4 | Complete package-level receipt boundary documentation | Medium-high | Implemented | Workflow receipts reference task IDs without copying task receipt schemas |
| 5 | Complete checkpoint recovery parity tests | Medium-high | Implemented | Restart, duplicate event, interrupted task, and checkpoint-save failure cases are covered |
| 6 | Normalize event ownership and adapter documentation | Medium | Implemented | Agent, queue, workflow, and Pi UI events have explicit owners and mappings |
| 7 | Define approved Ralplan output adapters | Medium-low | Implemented | Approved plans map through one workflow-owned adapter into downstream workflow inputs without moving planning policy |
| 8 | Evaluate Ultragoal orchestrator integration only for a real DAG | Low-medium | Complete — no adapter | Ultragoal has an ordered goal sequence rather than independent goals with generic dependencies; the boundary checker rejects Orchestrator imports in the skill |
| 9 | Keep Ralplan policy and Deep-interview workflow-owned | Low | Guardrail | No policy, artifact, verdict, or approval logic moves into orchestrator |

## Direct manager exception

Workflow code may call Pi's public `SubagentManagerApi` directly only when the operation controls one subagent or runs one workflow-owned worker. The structural workflow context is `packages/workflows/src/tool/context.ts`; registration lives in `packages/workflows/src/tool/register.ts`. Worker adapters are `packages/workflows/src/skills/team/agent-adapter.ts`, `packages/workflows/src/skills/ralplan/agent-adapter.ts`, and `packages/workflows/src/skills/ultragoal/tools.ts`. A workflow must use the orchestrator for task dependencies, agent assignment, retries, queue execution, or agent collaboration. Pi-native controls in `packages/pi/src/subagents/tools.ts` are host-owned and are not workflow adapters; they must not import workflow contracts or receipt assembly. Unknown manager call sites fail the package boundary check.

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

The Team adapter, Ralplan role adapter and approved-output adapter, explicit role coordinators, failure persistence, dependency/recovery parity, and idempotent event stores are implemented. Ultragoal and Deep Interview remain workflow-owned; do not integrate either without a separate generic DAG requirement.
