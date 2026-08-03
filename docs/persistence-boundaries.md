# Persistence Boundaries

This document defines ownership for persisted state across Pi packages. Persistence must follow package boundaries: lower layers do not import higher-layer storage, and higher layers treat lower-layer payloads through public package APIs. See [`team-workflow-orchestrator-adapter.md`](./team-workflow-orchestrator-adapter.md) for the team workflow checkpoint-store design.

## State ownership

| State | Owner | Scope | Persistence contract |
| --- | --- | --- | --- |
| Agent state | `@tsuuanmi/pi-agent` | One agent runtime/session | Message/tool runtime state owned by the agent runtime |
| Orchestrator checkpoint | `@tsuuanmi/pi-orchestrator` | One task DAG run | Strict versioned payload behind `OrchestratorCheckpointStore` |
| Workflow state | `@tsuuanmi/pi-workflows` | One named workflow/session | Workflow runtime storage, leases, mutation queues, and recovery |
| Pi session state | `@tsuuanmi/pi` | CLI session, TUI, resources, extensions | Pi session manager and app configuration |

## Ownership flow

```text
@tsuuanmi/pi
  owns CLI/session/UI state
  uses @tsuuanmi/pi-workflows through workflow tools and commands

@tsuuanmi/pi-workflows
  owns workflow state and storage
  may implement OrchestratorCheckpointStore
  may pass that store to Orchestrator.run()

@tsuuanmi/pi-orchestrator
  owns checkpoint schema and validation
  calls checkpointStore.load() and checkpointStore.save(checkpoint)

@tsuuanmi/pi-agent
  owns agent runtime state
```

## Orchestrator checkpoint contract

`@tsuuanmi/pi-orchestrator` owns the checkpoint schema. Stores are supplied through the `OrchestratorCheckpointStore` interface.

Store expectations:

- `load()` returns the exact stored orchestrator checkpoint payload or `undefined`.
- `save(checkpoint)` stores the full checkpoint payload atomically from the caller's perspective.
- Stores do not mutate checkpoint internals.
- Stores do not downgrade or translate checkpoint versions.
- Invalid checkpoint payloads fail through orchestrator normalization.
- Save failures are handled by orchestrator according to `checkpointFailurePolicy`.

The checkpoint payload is not workflow state. Workflows may store it, but orchestrator owns the schema.

## Workflow state contract

`@tsuuanmi/pi-workflows` owns workflow state, including:

- workflow runtime owner lifecycle
- workflow leases
- workflow mutation queues
- workflow command state
- workflow HUD state
- workflow artifacts
- workflow recovery markers
- team role execution receipts and idempotent event records
- session-owned active state and handoff transaction journals

Active-state schema version 2 requires every entry to carry the owning `session_id`; reads reject unsupported versions, missing, malformed, and foreign-session entries. Handoff journals use one top-level `session_id` and do not duplicate identity on caller or callee sides. No migration or global fallback is supported.

When a workflow uses orchestrator, workflow state must map to orchestrator inputs and outputs through an adapter.

Team execution persistence is owned by `execution-store.ts`. It rejects older execution timestamps and conflicting same-timestamp payloads, while allowing identical retries. The generic state writer remains responsible only for atomic file operations.

```text
Workflow state
  -> adapter
  -> TaskInput[] / Team / Orchestrator options
  -> Orchestrator.run()
  -> queue events / RunTeamResult / receipts
  -> adapter
  -> workflow state / HUD / artifacts / role receipts
```

## Pi session contract

`@tsuuanmi/pi` owns CLI and app integration state. Pi may display workflow state or orchestrator results through public APIs, but it must not mutate orchestrator checkpoints or workflow storage internals.

Pi should integrate packages by:

- loading workflow tools and commands
- wiring extension hooks
- rendering public state/results
- passing app context through explicit APIs

Pi should not implement workflow business logic or generic orchestration internals.

## Allowed patterns

```text
pi-workflows imports OrchestratorCheckpointStore from pi-orchestrator
pi-workflows implements a workflow-owned checkpoint store
pi-workflows passes checkpointStore to Orchestrator.run()
pi displays RunTeamResult.resume through public workflow/UI APIs
```

## Forbidden patterns

```text
pi-orchestrator imports pi-workflows storage
pi-orchestrator imports pi session APIs
pi-agent persists orchestrator task checkpoints
pi-workflows copies orchestrator checkpoint schema instead of importing public types
pi mutates orchestrator checkpoint internals
pi interprets workflow storage internals directly
```

## Adapter rules

A workflow-owned orchestrator adapter must:

1. Live in `@tsuuanmi/pi-workflows`.
2. Import public orchestrator APIs only.
3. Store orchestrator checkpoints as orchestrator-owned payloads.
4. Map workflow state to `TaskInput` without leaking workflow internals into orchestrator.
5. Map queue events to workflow events/HUD state without changing orchestrator event names.
6. Preserve workflow gates, artifacts, and user-facing state in workflows.
7. Keep orchestrator unaware of workflow storage paths and session layout.

## ROI-ranked follow-up tasks

Session identity hardening is complete: active-state entries and handoff journals are versioned, session-owned, and reject legacy or foreign identities.

| Rank | Task | ROI | Owner |
| ---: | --- | --- | --- |
| 1 | Persist role receipts and idempotent team events in workflow-owned stores | Done | `pi-workflows` |
| 2 | Add deterministic fresh/resume and failure-recovery tests | In progress | `pi-workflows` |
| 3 | Audit workflow storage payloads that resemble task checkpoints | In progress | `pi-workflows` |
| 4 | Add docs showing `RunTeamResult.resume` display through workflow/UI layers | Done | `pi-workflows`, `pi` |
| 5 | Keep generic storage helpers in orchestrator only when multiple stores need them | Ongoing guardrail | `pi-orchestrator` |

## Do not add yet

Do not add these without a concrete workflow implementation plan:

- shared storage abstractions across all packages
- checkpoint version adapters, fallback loaders, or compatibility wrappers
- workflow storage imports in orchestrator
- Pi session imports in workflows
- generic lease ownership in orchestrator
