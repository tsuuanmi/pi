# @tsuuanmi/pi-orchestrator

Task, team, and multi-agent orchestration primitives for Pi. Built on the `Agent` runtime contract from `@tsuuanmi/pi-agent`.

## Installation

```bash
npm install @tsuuanmi/pi-orchestrator
```

## Package Scope

`@tsuuanmi/pi-orchestrator` owns the standard `Task`, `TaskQueue`, `Team`, `MessageBus`, `Orchestrator`, routing, checkpoint, consensus verification, and task execution contracts.

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
