# @tsuuanmi/pi-agent

Multi-agent orchestration primitives for Pi. Built on `@tsuuanmi/pi-ai` adapter contracts.

## Installation

```bash
npm install @tsuuanmi/pi-agent
```

## Package Scope

`@tsuuanmi/pi-agent` provides lightweight `Agent`, `AgentRuntime`, `Team`, `Task`, `TaskQueue`, and `Orchestrator` primitives. Provider/model transport lives in `@tsuuanmi/pi-ai`; pass a stream-backed runtime or custom runtime to each agent.

See [Orchestrator update logic](./docs/orchestrator.md) for scheduling, pipelining, and structured handoff behavior.

Node-only helpers are available from the `@tsuuanmi/pi-agent/node` subpath.

## Quick Start

```typescript
import { Agent, Team, runTeam } from "@tsuuanmi/pi-agent";
import type { LlmAdapter } from "@tsuuanmi/pi-ai";

const adapter: LlmAdapter = {
  async complete(messages) {
    return { content: `handled ${messages.at(-1)?.content}` };
  },
};

const team = new Team("builders", [
  new Agent({
    name: "planner",
    instructions: "Plan concise implementation steps.",
    adapter,
    capabilities: ["planning"],
  }),
  new Agent({
    name: "reviewer",
    instructions: "Review outputs for correctness.",
    adapter,
    capabilities: ["review"],
  }),
]);

const result = await runTeam(team, [
  { id: "plan", title: "Plan", description: "Create the plan", requires: ["planning"] },
  { id: "review", title: "Review", description: "Review the plan", dependsOn: ["plan"], requires: ["review"] },
], { strategy: "capability-match" });

console.log(result.success, result.output);
```

## Core Concepts

- `Agent`: wraps instructions, capabilities, tools, and an `LlmAdapter`. Runtime agents can set `maxTurns` to stop gracefully before runaway provider calls and use `createSlidingWindowContextTransform()` for safe context pruning.
- `Task`: tracks title, description, dependency IDs, requirements, assignee, status, result, and error.
- `TaskQueue`: owns task snapshots and dependency readiness.
- `Team`: named roster of agents.
- `Orchestrator`: assigns ready tasks, pipelines newly unblocked work, and executes dependency batches until completion or failure.

## Scheduling

Supported strategies:

- `dependency-first` (default): run tasks that unblock the largest downstream set first.
- `capability-match`: choose the first agent whose capabilities satisfy all task requirements.
- `round-robin`: distribute ready tasks across the roster.
- `least-busy`: accepted as an API strategy and currently follows deterministic roster assignment.

## Attribution

This package's architecture is adapted from `open-multi-agent` under the MIT license. See `NOTICE` for attribution.
