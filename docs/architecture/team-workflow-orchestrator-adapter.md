# Team Workflow Orchestrator Adapter

This document records how `@tsuuanmi/pi-workflows` uses `@tsuuanmi/pi-orchestrator` inside the team workflow without weakening package boundaries. See [`team-workflow-orchestrator-runtime.md`](./team-workflow-orchestrator-runtime.md) for the runtime contract.

## Purpose

Use the generic orchestrator engine for every worker, reviewer, and prover role. Workflow role selection and gates remain outside the engine; only admitted role tasks map to `TaskInput`, runtime `Agent`s, queue events, and task receipts.

## Non-goals

- Do not import workflows into orchestrator.
- Do not move workflow gates into orchestrator.
- Do not move workflow HUD state into orchestrator.
- Do not move workflow artifact layout into orchestrator.
- Do not add fallback routing or fallback execution.
- Do not add alternate task formats or aliases.
- Do not add compatibility wrappers.
- Do not implement runtime code in this design step.

## Ownership

| Concern | Owner |
| --- | --- |
| Generic DAG execution | `@tsuuanmi/pi-orchestrator` |
| Workflow team state | `@tsuuanmi/pi-workflows` |
| Workflow gates and verdicts | `@tsuuanmi/pi-workflows` |
| Workflow artifacts | `@tsuuanmi/pi-workflows` |
| Queue events | Emitted by `@tsuuanmi/pi-orchestrator`, consumed by workflow adapter |
| Checkpoint schema | `@tsuuanmi/pi-orchestrator` |
| Checkpoint storage path | `@tsuuanmi/pi-workflows` |
| Agent runtime | `@tsuuanmi/pi-agent` |

## Adapter boundary

The adapter lives in `@tsuuanmi/pi-workflows`.

```text
workflow team state
  -> team_execute / team_resume
  -> TaskInput[] / Team / Orchestrator options
  -> Orchestrator.run()
  -> RunTeamResult / TaskQueueEvent / TaskExecutionReceipt
  -> mapped task state / HUD / workflow receipt references
  -> workflow team state
```

`@tsuuanmi/pi-orchestrator` remains unaware of workflow storage, workflow gates, workflow HUD state, and workflow artifacts.

## Implemented boundary modules

| Module | Purpose |
| --- | --- |
| `task-mapper.ts` | Convert workflow task state and snapshots to and from orchestrator task types |
| `status-mapper.ts` | Convert orchestrator task statuses to workflow task statuses |
| `event-mapper.ts` | Convert queue events to workflow event/HUD updates |
| `receipt-mapper.ts` | Convert task receipts to workflow receipt references |
| `orchestrator-checkpoint.ts` | Store orchestrator checkpoints through workflow-owned persistence |
| `orchestrator-events.ts` | Deliver mapped queue events to workflow-owned sinks |
| `agent-adapter.ts` | Convert explicit subagent profiles into orchestrator agents |
| `execution-applier.ts` | Apply execution state without changing workflow gate status |
| `execution-store.ts` | Persist execution fields without overwriting workflow status |
| `execution.ts` | Compose run, apply, and persist as one fail-fast operation |
| `tools.ts` | Expose explicit `team_execute` and `team_resume` entry points |
| `role-contract.ts` | Validate required reviewer and prover workflow evidence |
| `role-run-store.ts` | Persist failures for every role run |
| `role-tasks.ts` | Build the next worker, reviewer, or prover task batch |
| `role-transitions.ts` | Apply workflow-owned transitions after successful role execution |
| `coordinator.ts` | Select the legal role and call fresh/resume execution |
| `receipt-store.ts` | Persist all role receipts, including synthetic prover receipts |
| `execution-failure.ts` | Build persisted failure state for aborted or failed runs |
| `orchestrator.ts` | Run an explicitly configured team through `Orchestrator.run()` |

`execution.ts` is the workflow-owned composition boundary for a persisted role run. `executeTeam()` requires a new run id and fresh pending role tasks; `resumeTeam()` requires an existing non-completed checkpoint. Both operations reject unresolved workflow blockers, persist failure state, deduplicate event records, enforce strict checkpoint saves, and write execution fields without changing workflow status. Review and completion gates remain authoritative. Mapping modules do not own orchestration policy.

Names stay concise and workflow-owned. Orchestrator does not define workflow adapter names.

## Task mapping

| Workflow team field | Orchestrator field | Rule |
| --- | --- | --- |
| task id | `TaskInput.id` | Required and stable |
| task title | `TaskInput.title` | Required; concise user-facing label |
| task prompt/body | `TaskInput.description` | Required; no workflow metadata leakage |
| task dependencies | `TaskInput.dependsOn` | Must form a strict DAG |
| worker capability | `TaskInput.requires.capabilities` | Hard routing constraint |
| required tools | `TaskInput.requires.tools` | Hard routing constraint |
| assigned worker | `TaskInput.assignee` | Optional; must match runtime `Team` roster |
| retry settings | `TaskInput.maxRetries`, `retryDelayMs`, `retryBackoff` | Optional; workflow policy decides values |
| workflow metadata | `TaskInput.metadata` | Only non-sensitive, orchestrator-relevant metadata |

Do not map workflow gates, mailbox state, HUD state, artifact paths, or review verdict internals into `TaskInput`.

## Status mapping

| Orchestrator status | Workflow status | Rule |
| --- | --- | --- |
| `pending` | `pending` | Task exists but is not running |
| `in_progress` | `in_progress` | Worker is executing |
| `completed` | `completed` | Workflow gates may still require review/proof |
| `failed` | `failed` | Workflow may record failure receipt |
| `blocked` | `blocked` | Dependency cannot complete |
| `skipped` | no `TeamTaskStatus` mapping | Workflow records explicit skip event and reason without inventing a task status |

Workflow gates remain workflow-owned. A completed orchestrator task does not automatically mean the whole workflow is approved.

## Queue event mapping

| Queue event | Workflow update |
| --- | --- |
| `task_ready` | Mark workflow task dispatchable |
| `task_start` | Mark workflow task running |
| `task_complete` | Mark workflow task completed and attach task receipt reference |
| `task_fail` | Mark workflow task failed |
| `task_skip` | Mark workflow task skipped |
| `task_block` | Mark workflow task blocked |
| `all_complete` | Evaluate workflow-owned final gates |

The adapter may translate event names into workflow event names, but it must not change orchestrator event semantics.

## Receipt mapping

Workflow receipts reference orchestrator task receipts instead of embedding their schema.

```ts
interface TeamTaskReceiptRef {
  package: "@tsuuanmi/pi-orchestrator";
  type: "task";
  id: string;
}
```

Workflow receipts may store:

- workflow action id
- workflow task id
- workflow gate outcome
- task receipt reference
- artifact references owned by workflows

Workflow receipts must not copy `TaskExecutionReceipt` fields.

## Checkpoint strategy

`TeamCheckpointStore` is workflow-owned and implements `OrchestratorCheckpointStore`.

Rules:

1. Store the orchestrator checkpoint as an orchestrator-owned payload.
2. Do not translate checkpoint versions.
3. Do not add fallback loaders.
4. Do not mutate checkpoint internals.
5. Let orchestrator validation reject invalid checkpoints.
6. Keep workflow recovery metadata outside the orchestrator checkpoint.
7. Always surface checkpoint-save failures; workflow callers cannot select best-effort persistence.

```text
workflow storage path
  -> TeamCheckpointStore.load()
  -> Orchestrator checkpoint payload
  -> Orchestrator.run()
  -> TeamCheckpointStore.save(checkpoint)
  -> workflow storage path
```

## Runtime flow

```text
Team workflow command/tool
  -> load workflow team state
  -> mapTeamTask[]
  -> build runtime Team from Agent roster
  -> create TeamCheckpointStore
  -> Orchestrator.run(team, tasks, options)
       onQueueEvent -> mapQueueEvent
       onSchedulingWarning -> workflow warning event
       onTrace -> workflow trace/audit hook
  -> map RunTeamResult to workflow state
  -> evaluate workflow gates
  -> write workflow receipts/artifacts
```

## Implementation phases

| Phase | Work | Acceptance |
| --- | --- | --- |
| A | Add focused mapping modules and mapping tests | Done; no mixed adapter module remains |
| B | Add `TeamCheckpointStore` | Done; stores strict orchestrator checkpoint JSON through workflow-owned callbacks |
| C | Add queue event sink | Done; maps orchestrator queue events to workflow-owned events |
| D | Add explicit team orchestrator runner | Done; `runTeamOrchestrator` requires agents and tasks and never falls back |
| E | Remove alternate direct spawn execution | Done; all team roles enter through the orchestrator tools |
| F | Build role task batches and gate progression | Done; coordinator submits worker, reviewer, and prover tasks through the orchestrator |
| G | Remove duplicate generic DAG execution | Done; one generic DAG implementation remains in `@tsuuanmi/pi-orchestrator` |

## Acceptance criteria for implementation

- No package boundary violations.
- Workflows import orchestrator; orchestrator imports nothing from workflows.
- No fallback routing or fallback execution is added.
- No alternate task shape or compatibility wrapper is accepted.
- Workflow gates remain workflow-owned.
- Workflow artifacts remain workflow-owned.
- Orchestrator checkpoints remain strict versioned payloads.
- Queue events and receipts are mapped through workflow-owned adapter code.

## Remaining runtime work

The focused adapter modules, explicit role coordinator, and fresh/resume operations are implemented. Each role batch has its own strictly persisted checkpoint; failed results are persisted and event writes are idempotent. Gate decisions remain workflow-owned. Do not integrate this team DAG into ultragoal, ralplan, or deep-interview without a separate requirement.
