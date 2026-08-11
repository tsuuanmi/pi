# Event Boundaries

Events are layer-owned observations, not a shared cross-package schema. A higher layer may map a lower-layer event into its own vocabulary, but it must not copy, re-export, or persist the lower-layer schema as if it owned it.

## Ownership

| Layer | Public event contracts | Responsibility |
| --- | --- | --- |
| `@tsuuanmi/pi-ai` | provider and assistant stream events | Provider transport and incremental model output |
| `@tsuuanmi/pi-agent` | `AgentEvent`, `EventSink` | Agent loop, message, trace, warning, and tool-execution lifecycle |
| `@tsuuanmi/pi-orchestrator` | `TaskQueueEvent`, `OrchestratorEvent`, `OrchestratorTraceEvent`, `TeamEvent` | Task scheduling, orchestration progress/trace, and runtime team messaging |
| `@tsuuanmi/pi-workflows` | `WorkflowRuntimeEvent`, `TeamWorkflowEvent` | Workflow state transitions and mapped workflow Team task visibility |
| `@tsuuanmi/pi` | `AgentSessionEvent`, extension hook events | Session lifecycle, host queues, compaction, retries, extensions, and UI invalidation |

## Mapping direction

```text
provider stream event
  -> AgentEvent
  -> AgentSessionEvent / host rendering

TaskQueueEvent
  -> mapTaskQueueEvent()
  -> TeamWorkflowEvent
  -> workflow event store / HUD state
```

Mappings are one-way and live in the consuming package. Agent does not import Pi session events. Orchestrator does not import workflow events. Workflows does not expose Orchestrator queue events as its own public schema.

## Team queue projection

`packages/workflows/src/skills/team/event-mapper.ts` is the only Orchestrator-to-workflow queue adapter. It maps:

| Orchestrator `TaskQueueEvent.type` | Workflow `TeamWorkflowEvent.type` |
| --- | --- |
| `task_ready` | `team_task_ready` |
| `task_start` | `team_task_started` |
| `task_complete` | `team_task_completed` |
| `task_fail` | `team_task_failed` |
| `task_skip` | `team_task_skipped` |
| `task_block` | `team_task_blocked` |
| `all_complete` | `team_all_complete` |

The workflow projection keeps only workflow-relevant task identity, mapped status, message, attempt, and timestamp. Persistence assigns a deterministic workflow event id that excludes timestamp so replayed queue events remain idempotent.

## Rules

1. Event type names identify their owning layer when package context is not sufficient.
2. Cross-layer conversions use explicit pure mappers in the consuming package.
3. Event persistence stores the owning layer's event, not a copied lower-layer payload.
4. Callback sinks remain at runtime boundaries; do not add wrappers without a production consumer.
5. UI code consumes state or host events and does not become an event persistence owner.
6. Compatibility aliases, dual emission, fallback mappings, and mutable global event registries are prohibited.
