# Team Workflow Orchestrator Runtime

This document designs the future feature-gated runtime path for using `@tsuuanmi/pi-orchestrator` inside the team workflow. It is a design only; it does not change runtime behavior.

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
- Do not add fallback from the orchestrator path to the current path.
- Do not accept legacy task shapes.
- Do not move workflow gates into orchestrator.
- Do not move workflow artifacts into orchestrator.
- Do not make orchestrator aware of workflow storage.
- Do not import `@tsuuanmi/pi` or `@tsuuanmi/pi/*` from workflows.

## Feature gate

Use an explicit mode:

```ts
type TeamOrchestratorMode = "off" | "on";
```

| Value | Behavior |
| --- | --- |
| `off` | Use the current team workflow path |
| `on` | Use the orchestrator-backed path |
| missing | Same as `off` |
| invalid | Fail config validation |

If the `on` path fails, it fails visibly. It must not silently fall back to the current path.

## Runtime flow

```text
team workflow start
  |
  +-- teamOrchestrator === "off"
  |     -> current workflow path
  |
  +-- teamOrchestrator === "on"
        -> load workflow team state
        -> map TeamTask[] to TaskInput[]
        -> build orchestrator Team from runtime Agents
        -> create TeamCheckpointStore
        -> create TeamEventSink
        -> Orchestrator.run(team, tasks, options)
        -> map RunTeamResult back to workflow state
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
| required tools | `TaskRequirements.tools` | workflow adapter |
| dependencies | `TaskInput.dependsOn` | workflow adapter |
| workflow checkpoint file | `TeamCheckpointStore` | workflows |
| queue event | `TeamEventSink` | workflows |
| task receipt | `TeamTaskReceiptRef` | workflows |

## Parity matrix

| Current team behavior | Orchestrator path equivalent | Notes |
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
| invalid feature value | fail config validation |
| no eligible agent | fail visibly and emit scheduling warning |
| task failure | map to workflow task failure |
| task skipped | map to workflow skip event without inventing status |
| checkpoint load error | fail before run |
| checkpoint save error | governed by explicit `checkpointFailurePolicy` |
| workflow gate failure | workflow-owned failure after orchestrator run |
| adapter write failure | fail visibly |

No failure path may silently fall back from orchestrator mode to the current workflow path.

## Required seams

Future runtime implementation should inject these seams explicitly:

| Seam | Purpose |
| --- | --- |
| orchestrator runner | Calls `Orchestrator.run()` in `on` mode |
| checkpoint store factory | Creates `TeamCheckpointStore` from workflow storage |
| event sink factory | Creates `TeamEventSink` for queue events |
| task mapper | Converts workflow tasks to `TaskInput[]` |
| result mapper | Converts `RunTeamResult` back to workflow-owned state |

These seams live in `@tsuuanmi/pi-workflows`.

## Future implementation phases

| Phase | Work | Acceptance |
| --- | --- | --- |
| A | Add `TeamOrchestratorMode` config validation | Done; invalid values fail before execution |
| B | Add injected seams | default mode remains current path |
| C | Add `on` runtime path | calls orchestrator only when explicitly enabled |
| D | Add parity tests | current and orchestrator modes are both covered |
| E | Remove duplicate generic DAG logic | only after parity is proven and approved |

## Future test plan

| Test | Expected |
| --- | --- |
| default mode uses current path | no orchestrator calls |
| `teamOrchestrator: "off"` uses current path | no orchestrator calls |
| `teamOrchestrator: "on"` maps tasks and calls orchestrator | one orchestrator run |
| orchestrator failure does not fall back | visible failure |
| queue event updates workflow state | mapped event |
| checkpoint store load/save called | strict payload |
| workflow gates still run after task completion | gate-owned behavior |
| no eligible agent emits warning | warning captured |
| invalid mode fails validation | no run |
| receipts are refs only | no embedded task receipt schema |

## Acceptance criteria for runtime implementation

- Default behavior remains unchanged.
- The feature gate is explicit.
- No fallback from orchestrator mode to current mode is added.
- No legacy task shape is accepted.
- Boundary checker passes.
- Team workflow tests pass in both modes.
- Orchestrator remains unaware of workflows.
- Workflow gates, artifacts, and HUD state remain workflow-owned.
