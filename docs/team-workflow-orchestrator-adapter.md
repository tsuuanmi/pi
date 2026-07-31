# Team Workflow Orchestrator Adapter

This document designs how `@tsuuanmi/pi-workflows` may use `@tsuuanmi/pi-orchestrator` inside the team workflow without weakening package boundaries. See [`team-workflow-orchestrator-runtime.md`](./team-workflow-orchestrator-runtime.md) for the feature-gated runtime design.

## Purpose

Use the generic orchestrator engine for generic team task DAG execution only when the team workflow has tasks that map cleanly to `TaskInput`, runtime `Agent`s, queue events, and task receipts.

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
  -> TeamOrchestratorAdapter
  -> TaskInput[] / Team / Orchestrator options
  -> Orchestrator.run()
  -> RunTeamResult / TaskQueueEvent / TaskExecutionReceipt
  -> TeamOrchestratorAdapter
  -> workflow team state / HUD / workflow receipts
```

`@tsuuanmi/pi-orchestrator` remains unaware of workflow storage, workflow gates, workflow HUD state, and workflow artifacts.

## Proposed names

| Name | Purpose |
| --- | --- |
| `TeamOrchestratorAdapter` | Workflow-owned coordinator around `Orchestrator.run()` |
| `TeamCheckpointStore` | Workflow-owned `OrchestratorCheckpointStore` implementation |
| `mapTeamTask` | Convert workflow task state to `TaskInput` |
| `mapTaskStatus` | Convert `TaskSnapshot` status to workflow task status |
| `mapQueueEvent` | Convert queue events to workflow event/HUD updates |
| `mapTaskReceipt` | Convert task receipt to workflow receipt reference |

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
| A | Add adapter types and mapping tests | Done; no runtime behavior change |
| B | Add `TeamCheckpointStore` | Done; stores strict orchestrator checkpoint JSON through workflow-owned callbacks |
| C | Add queue event sink | Done; maps orchestrator queue events to workflow-owned events without runtime wiring |
| D | Run orchestrator behind explicit workflow config | `on` mode calls orchestrator; `off` mode uses the workflow-owned path |
| E | Remove duplicate generic DAG execution | One generic DAG implementation remains after parity is proven and approved |

## Acceptance criteria for implementation

- No package boundary violations.
- Workflows import orchestrator; orchestrator imports nothing from workflows.
- No fallback routing or fallback execution is added.
- No alternate task shape or compatibility wrapper is accepted.
- Workflow gates remain workflow-owned.
- Workflow artifacts remain workflow-owned.
- Orchestrator checkpoints remain strict versioned payloads.
- Queue events and receipts are mapped through workflow-owned adapter code.

## Do not implement yet

Do not start runtime integration until [`team-workflow-orchestrator-runtime.md`](./team-workflow-orchestrator-runtime.md) is approved. The completed implementation steps contain only adapter mappings, mapping tests, a callback-backed checkpoint store, and a queue-event sink.
