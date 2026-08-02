# Team Workflow Orchestrator Runtime

This document defines the runtime path for using `@tsuuanmi/pi-orchestrator` inside the team workflow. Workflow-owned task mapping, role selection, strict admission checks, explicit fresh/resume operations, and persisted execution state are implemented.

## Purpose

Define how `@tsuuanmi/pi-workflows` can run generic team task DAGs through `@tsuuanmi/pi-orchestrator` while preserving package boundaries and workflow ownership.

```text
@tsuuanmi/pi-workflows
  -> workflow-owned adapter
  -> @tsuuanmi/pi-orchestrator
  -> workflow-owned adapter
  -> workflow state / HUD / receipts
```

## Non-goals

- Do not switch default team workflow behavior.
- Do not add fallback from the orchestrator path to the workflow-owned path.
- Do not accept alternate task shapes or aliases.
- Do not add compatibility wrappers.
- Do not move workflow gates into orchestrator.
- Do not move workflow artifacts into orchestrator.
- Do not make orchestrator aware of workflow storage.
- Do not import `@tsuuanmi/pi` or `@tsuuanmi/pi/*` from workflows.

## Execution operations

There is one execution engine and two explicit operations:

| Operation | Behavior |
| --- | --- |
| `team_execute` | Start a fresh orchestrator run; reject an existing checkpoint; allow the legal prover run during `awaiting_integration` |
| `team_resume` | Resume an existing `running` orchestrator checkpoint; completed and aborted checkpoints are terminal |

There is no mode flag, default path, alternate task shape, or fallback executor.

## Runtime flow

```text
team_execute / team_resume
        -> load workflow team state
        -> select the legal workflow role
        -> map role tasks to TaskInput[]
        -> build orchestrator Team from explicit Agents
        -> create TeamCheckpointStore and event sink
        -> Orchestrator.run(team, tasks, options)
        -> map RunTeamResult to execution state
        -> evaluate workflow gates
        -> write workflow receipts/artifacts
```

## Data mapping

| Workflow concept | Orchestrator concept | Owner |
| --- | --- | --- |
| `TeamTask` | `TaskInput` | workflow adapter |
| `TeamTask.status` | `TaskSnapshot.status` mapped back | workflow adapter |
| worker roster | `Team` of `Agent`s | workflow runtime |
| worker capability | `TaskRequirements.capabilities` | workflow adapter |
| reviewer capability | `TaskRequirements.capabilities` | workflow adapter |
| prover capability | `TaskRequirements.capabilities` | workflow adapter |
| required tools | `TaskRequirements.tools` | workflow adapter |
| dependencies | `TaskInput.dependsOn` | workflow adapter |
| workflow checkpoint file | `TeamCheckpointStore` | workflows |
| queue event | `TeamEventSink` | workflows |
| task receipt | `TeamTaskReceiptRef` | workflows |

## Parity matrix

| Workflow-owned behavior | Orchestrator path equivalent | Notes |
| --- | --- | --- |
| create task | map to `TaskInput` | strict fields only |
| assign worker | `assignee` or requirements | no fallback assignment |
| wait for dependencies | `TaskQueue.ready()` | strict DAG |
| task running | `task_start` queue event | adapter updates workflow state |
| task complete | `task_complete` queue event | adapter attaches receipt ref |
| task failed | `task_fail` queue event | adapter updates workflow state |
| task blocked | `task_block` queue event | adapter updates workflow state |
| task skipped | `task_skip` queue event | adapter records skip event without inventing status |
| team all complete | `all_complete` queue event | workflow gates still decide final status |
| review/proof gate | workflow-owned gate after task result | not orchestrator |
| mailbox/artifacts | workflow-owned | not orchestrator |
| checkpoint | `TeamCheckpointStore` | stores orchestrator-owned payload |

## Failure model

| Failure | Behavior |
| --- | --- |
| mapping error | fail before `Orchestrator.run()` |
| invalid operation input | fail before run |
| no eligible agent | fail visibly and emit scheduling warning |
| task failure | map to workflow task failure |
| task skipped | map to workflow skip event without inventing status |
| checkpoint load error | fail before run |
| checkpoint save error | governed by explicit `checkpointFailurePolicy` |
| workflow gate failure | workflow-owned failure after orchestrator run |
| adapter write failure | fail visibly |

No failure path may invoke a second execution engine.

## Required seams

Runtime seams are explicit and workflow-owned:

| Seam | Purpose | Status |
| --- | --- | --- |
| agent roster | Converts explicit subagent profiles into orchestrator agents | Implemented by `agent-adapter.ts` |
| coordinator | Selects the legal role and builds the admitted task batch | Implemented by `team-coordinator.ts` |
| role contract | Requires passed gate status and valid, non-blocking reviewer/prover evidence before success is reported | Implemented by `role-contract.ts` |
| role failure | Persists failures when no workflow task can hold execution state | Implemented by `role-run-store.ts` |
| role transition | Applies workflow-owned status changes after execution | Implemented by `role-transitions.ts` |
| receipt store | Persists every role receipt | Implemented by `receipt-store.ts` |
| failure state | Converts failed/aborted execution into durable workflow execution state | Implemented by `execution-failure.ts` and `role-run-store.ts` |
| orchestrator runner | Calls `Orchestrator.run()` for every team execution | Implemented by `team-orchestrator.ts` |
| checkpoint store factory | Creates `TeamCheckpointStore` from workflow storage | Implemented by `orchestrator-checkpoint.ts` |
| event sink factory | Maps queue events for workflow persistence | Implemented by `event-mapper.ts` and `event-store.ts` |
| task mapper | Converts workflow tasks to `TaskInput[]` | Implemented by `task-mapper.ts` |
| result mapper | Converts `RunTeamResult` into execution-only workflow state | Implemented by `execution-applier.ts` and receipt mappers |
| execution store | Persists execution fields without changing workflow status; rejects stale or conflicting writes | Implemented by `execution-store.ts` |
| capability routing | Requires exact role capability matches; missing matches fail closed | Implemented by Orchestrator routing and `agent-adapter.ts` |
| execution boundary | Composes run, apply, and persist | Implemented by `team-execution.ts` |
| explicit runtime tools | Supply fresh/resume operation and agent roster | Implemented by `team_execute` and `team_resume` |

These seams live in `@tsuuanmi/pi-workflows`.

## Future implementation phases

| Phase | Work | Acceptance |
| --- | --- | --- |
| A | Remove alternate execution paths | Done; all team execution enters the orchestrator boundary |
| B | Add focused mapping, checkpoint, event, runner, execution-state, and persistence seams | Done; the composed execution boundary preserves workflow gates |
| C | Add explicit fresh/resume operations | Done; checkpoint reuse is explicit |
| D | Build role task batches | Implemented; worker, reviewer, and prover batches use the orchestrator |
| E | Add parity and recovery tests | In progress; admission, persistence, and role-batch coverage is complete |
| F | Remove duplicate generic DAG logic | Done; team has one Orchestrator execution boundary |

## Future test plan

| Test | Expected |
| --- | --- |
| `team_execute` rejects an existing checkpoint | visible failure |
| `team_resume` rejects a missing, completed, or aborted checkpoint | visible failure |
| every team operation calls orchestrator | one orchestrator execution path |
| orchestrator failure does not fall back | visible failure |
| queue event updates workflow state | mapped event |
| checkpoint store load/save called | strict payload |
| workflow gates still run after task completion | gate-owned behavior |
| no eligible agent emits warning | warning captured |
| invalid operation input fails validation | no run |
| receipts are refs only | no embedded task receipt schema |

## Acceptance criteria for runtime implementation

- All team execution uses `@tsuuanmi/pi-orchestrator`.
- Fresh and resume operations are explicit; only interrupted `running` checkpoints are resumable.
- No second execution engine or fallback path exists.
- No alternate task shape or compatibility wrapper is accepted.
- Boundary checker passes.
- Team execution, coordinator role progression, strict role-contract, retry, abort, recovery, stale-write, checkpoint-receipt, failure-persistence, and idempotency tests pass.
- Orchestrator remains unaware of workflows.
- Workflow gates, artifacts, and HUD state remain workflow-owned.
