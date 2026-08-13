# @tsuuanmi/pi-orchestrator

Task, team, subagent, and multi-agent orchestration for Pi. Built on the core `@tsuuanmi/pi` session host and `@tsuuanmi/pi-agent` runtime.

## Installation

```bash
npm install @tsuuanmi/pi-orchestrator
```

## Package Scope

`@tsuuanmi/pi-orchestrator` owns the standard `Task`, `TaskQueue`, `Team`, `MessageBus`, `Orchestrator`, routing, checkpoint, consensus verification, task execution, and session-aware subagent contracts.

It coordinates generic `Agent` instances and provides Pi-hosted `SubagentManager` execution with isolated sessions, persistence, lifecycle tools, and durable inspection. The generic `subagent_spawn` primitive executes a caller-resolved profile, prompt, and tool policy; it may read the task from a workspace file, persist opaque caller metadata, and atomically materialize captured assistant output at a caller-selected workspace path. The orchestrator-owned runtime artifact remains separate and authoritative for lifecycle evidence. Orchestrator never selects workflow roles or interprets workflow output.

Task requirements are structured and strict: `capabilities`, `tools`, `provider`, `api`, and `model` are hard constraints. `TaskQueueEvent` reports queue lifecycle through `TaskQueue.subscribe()` and `run(..., { onQueueEvent })`; `OrchestratorEvent` reports run progress, and `TeamEvent` is reserved for runtime team messaging. Workflow projections use their own event names and schemas.

`TaskExecutionReceipt` and `TaskConsequentialReceipt` are the public task-execution receipt contracts. They own routing, retry, verification, approval, and metrics evidence, but not workflow state, gates, or artifact paths.

Agent behavior, the single-agent turn loop, and tool protocol remain in `@tsuuanmi/pi-agent`. Pi owns the application session host; orchestrator owns subagent execution.

See [Orchestrator documentation](./docs/orchestrator/orchestrator.md) and [Subagent](./docs/subagent/index.md) for integration patterns.

## Quick Start

```typescript
import { Agent } from "@tsuuanmi/pi-agent";
import { Orchestrator, Team } from "@tsuuanmi/pi-orchestrator";

const team = new Team({
  name: "builders",
  agents: [new Agent({ name: "worker", initialState: { model, systemPrompt, tools } })],
});

const result = await new Orchestrator().run(team, [
  { id: "draft", title: "Draft", description: "Write the draft" },
]);
```

## Production Patterns

### Strict routing requirements

```typescript
await new Orchestrator().run(team, [
  {
    id: "review",
    title: "Review",
    description: "Review the draft",
    requires: { capabilities: ["review"], tools: ["read"] },
  },
]);
```

All declared requirements are hard constraints. The orchestrator does not assign a fallback agent when no agent satisfies a task.

### Queue lifecycle events

```typescript
await new Orchestrator().run(team, tasks, {
  onQueueEvent: (event) => {
    console.log(event.type, event.task?.id);
  },
});
```

Queue event names are stable: `task_ready`, `task_start`, `task_complete`, `task_fail`, `task_skip`, `task_block`, and `all_complete`.

### Checkpoint resume

```typescript
const result = await new Orchestrator().run(team, tasks, { checkpointStore });

if (result.resume.resumed) {
  console.log("resumed from", result.resume.checkpointUpdatedAt);
}
```

Checkpoints are strict versioned payloads. Save failures are best-effort by default; use `checkpointFailurePolicy: "strict"` when a checkpoint write failure must fail the run.

### Routing diagnostics

```typescript
await new Orchestrator().run(team, tasks, {
  onSchedulingWarning: (warning) => console.error(warning.message),
  onTrace: (event) => {
    if (event.type === "routing_decision") console.log(event.data);
  },
});
```

Routing decisions include the selected agent, score, reasons, candidates, and rejected agents.
