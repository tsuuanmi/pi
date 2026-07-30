# @tsuuanmi/pi-orchestrator

Task, team, and multi-agent orchestration primitives for Pi. Built on the `Agent` runtime contract from `@tsuuanmi/pi-agent`.

## Installation

```bash
npm install @tsuuanmi/pi-orchestrator
```

## Package Scope

`@tsuuanmi/pi-orchestrator` owns the standard `Task`, `TaskQueue`, `Team`, `MessageBus`, `Orchestrator`, routing, checkpoint, consensus verification, and task execution contracts.

Task requirements are structured and strict: `capabilities`, `tools`, `provider`, `api`, and `model` are hard constraints. Queue lifecycle events are available through `TaskQueue.subscribe()` and `run(..., { onQueueEvent })`.
Agent behavior, runtime execution, tool protocol, and subagent contracts remain in `@tsuuanmi/pi-agent`.

See [Orchestrator documentation](./docs/orchestrator/orchestrator.md) for the standard integration patterns.

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
