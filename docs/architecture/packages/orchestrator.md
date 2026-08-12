# `@tsuuanmi/pi-orchestrator`

[Package README](../../../packages/orchestrator/README.md) | [Orchestrator reference](../../../packages/orchestrator/docs/orchestrator/orchestrator.md) | [Public barrel](../../../packages/orchestrator/src/index.ts) | [Workspace overview](../package-overview.md) | [Integration map](../component-integration-map.md) | [Overlap audit](../package-overlap-audit.md)

## Role

`@tsuuanmi/pi-orchestrator` is the multi-agent execution layer above the Pi and Agent cores. It provides generic task/team orchestration and the complete session-aware subagent runtime.

It is workflow-agnostic. Workflow packages translate domain state into orchestrator tasks or subagent requests and translate results back.

## Boundary

**Owns**

- Mutable tasks with validated lifecycle transitions and immutable snapshots.
- Acyclic dependency graphs, readiness, blocked/skipped propagation, and queue events.
- Agent eligibility, scoring, deterministic routing, scheduling, and bounded concurrency.
- Per-task execution through `Agent.run()`, retry classification, failure policy, budgets, and cancellation.
- Consequential-action and verification gates.
- Run metrics, traces, receipts, immutable run facts, and checkpoint schema/restore validation.
- Team rosters and an in-memory direct/broadcast message bus.
- Optional LLM task planning and consensus verification utilities.
- Pi-hosted subagent manager contracts, isolated sessions, persistence, lifecycle tools, receipts, and native/tmux execution.

**Does not own**

- Model/provider transport or tool execution inside an Agent.
- Workflow-specific phases, approvals, artifacts, handoffs, or HUD policy.
- A durable checkpoint database or filesystem location; callers implement `OrchestratorCheckpointStore`.
- A cross-process team message transport or persistent message retention.
- The main Pi application session, CLI, UI, resource loading, settings, or auth ownership.
- Workflow-specific registration and product composition policy.

## Public entry point

`@tsuuanmi/pi-orchestrator` has one code entry, [`src/index.ts`](../../../packages/orchestrator/src/index.ts). It exports:

- `Orchestrator`, run/plan options, events, hooks, budgets, metrics, results, and traces.
- `Task`, `TaskQueue`, task inputs/snapshots/status/dependency and verification contracts.
- `Team`, `MessageBus`, team snapshots, and message types.
- `Scheduler`, `AgentSelector`, routing criteria, strategies, decisions, and warnings.
- Checkpoint, run-fact, run-identity, receipt, and restore contracts.
- Consensus verification helpers.
- `SubagentManager`, `SubagentManagerApi`, request/result/record contracts, lifecycle registration, progress, receipts, and runtime composition.

`#orchestrator/*` aliases are internal; no implementation subpath is published.

## Components

| Component | Source | Responsibility |
|---|---|---|
| Facade | [`src/orchestrator.ts`](../../../packages/orchestrator/src/orchestrator.ts) | Plans, restores, validates, creates run context, dispatches work, and returns the final run result |
| Public contracts | [`src/types.ts`](../../../packages/orchestrator/src/types.ts) | Options, hooks, events, budgets, verification, planning, metrics, traces, and result types |
| Task state machine | [`src/task/task.ts`](../../../packages/orchestrator/src/task/task.ts) | Lifecycle transitions, dependency validation, bounded prompts, retries, and snapshots |
| Task graph | [`src/task/queue.ts`](../../../packages/orchestrator/src/task/queue.ts) | DAG validation, status partitions, readiness, events, and restore |
| Routing | [`src/routing/`](../../../packages/orchestrator/src/routing) | Hard eligibility filters, agent scoring, scheduling strategy, and assignment |
| Executor | [`src/execution/executor.ts`](../../../packages/orchestrator/src/execution/executor.ts) | Budget and approval checks, `Agent.run()`, verification, retry/failure policy, receipts, and checkpoints |
| Governance | [`src/execution/governance.ts`](../../../packages/orchestrator/src/execution/governance.ts) | Team/assignee validation, dispatch gates, and unreachable work handling |
| Run context | [`src/runtime/context.ts`](../../../packages/orchestrator/src/runtime/context.ts) | Run-scoped in-flight state, aborts, callbacks, timers, metrics, receipts, and serialized checkpoint writes |
| Checkpoints | [`src/runtime/checkpoint.ts`](../../../packages/orchestrator/src/runtime/checkpoint.ts) | Strict checkpoint schema, normalization, identity/fact validation, and persistence interface |
| Team/message bus | [`src/team/`](../../../packages/orchestrator/src/team) | Named Agent roster plus process-local direct/broadcast messaging |
| Planning/consensus | [`src/planning/`](../../../packages/orchestrator/src/planning) | Strict model-generated task plans and sequential consensus judging |
| Subagent | [`src/subagent/`](../../../packages/orchestrator/src/subagent) | Session-aware manager, persistence, lifecycle tools, registry, receipts, native/tmux backends, and worker command |

## Run data flow

```text
TaskInput[] + Team
  -> validate and build TaskQueue DAG
  -> find ready tasks
  -> Scheduler orders work
  -> AgentSelector filters and scores Agents
  -> dispatch and approval gates
  -> selected Agent.run(task prompt)
  -> optional verification
  -> complete, retry, fail, skip, or block task
  -> metrics + receipt + checkpoint
  -> repeat until terminal RunTeamResult
```

Eligibility is checked before strategy scoring. Requirements can constrain capabilities, tool names, provider, API, model, assignee, and routing metadata. Dependency results are formatted into bounded task prompts rather than exposed through a shared mutable context.

## Dependencies

### Workspace runtime

| Dependency | Contract used |
|---|---|
| `@tsuuanmi/pi` | Public session factories/services, session manager, extension contracts, agent profiles, session roots, and Pi/tmux host utilities |
| `@tsuuanmi/pi-agent` | `Agent`, tool/capability/model state, thinking levels, structured receipts, and isolated `Agent.run()` results |
| `@tsuuanmi/pi-ai` | Assistant message contracts used for progress and yield handling |
| `typebox` | Subagent lifecycle tool schemas |

The package uses Node APIs and requires Node.js 22.19 or newer.

## Interactions with other packages

Pi extensions and `@tsuuanmi/pi-workflows` are runtime consumers.

- Team workflow maps its durable tasks and configured agent profiles to `TaskInput[]` and `Team`, runs `Orchestrator`, then maps queue events, checkpoints, receipts, and results back into workflow state.
- Ralplan runs one admitted planning stage as a one-agent, one-task orchestrator run with strict checkpoint policy, explicit run identity, abort propagation, and artifact verification.
- Workflow-specific phase order, approval, handoff, and artifact rules remain outside Orchestrator.

Pi does not import Orchestrator. The bundled Workflows extension installs `registerSubagentRuntime`, and orchestrator resolves its manager from Pi's generic `ExtensionContext.sessionServices` boundary.

## State and persistence

- Tasks, queues, metrics, receipts, routing decisions, and in-flight work live in a run-scoped context.
- Versioned checkpoint values contain the resumable orchestration snapshot.
- `OrchestratorCheckpointStore` delegates `load` and `save` to the caller. Workflows supplies filesystem-backed stores in its own session layout.
- Checkpoint restore validates version, run identity, immutable facts, queue partitions, metrics, and receipts. There is no implicit migration of incompatible versions.
- `MessageBus` is in-memory. It can produce a snapshot but does not itself persist or transport messages.
- Subagent records, identities, artifacts, and worker metadata persist under the owning Pi session's state root.

## Extension points

- Scheduling strategy and `AgentSelector` criteria.
- Dispatch, consequential-action approval, verification, retry classification, and failure-action hooks.
- Progress, trace, warning, and queue-event callbacks.
- Budget and concurrency configuration.
- `OrchestratorCheckpointStore` plus best-effort or strict checkpoint failure policy.
- Planner coordinator Agent and consensus judge Agents.
- Caller-defined task requirements, routing metadata, and opaque verification payloads.
- Native or tmux subagent execution selected per request.

## Runtime constraints

- ESM; Node.js 22.19 or newer.
- Task dependencies must form an acyclic graph.
- Checkpoint format is strict and versioned; unsupported versions fail restore.
- Planning and consensus expect strict JSON model output.
- Consensus judges run sequentially.
- Hooks run in-process and participate in execution latency and failure behavior.
