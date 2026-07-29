# @tsuuanmi/pi-agent

Standard agent behavior, runtime, tool, message, orchestration, and subagent contracts for Pi. Built on `@tsuuanmi/pi-ai` provider/model transport contracts.

## Installation

```bash
npm install @tsuuanmi/pi-agent
```

## Package Scope

`@tsuuanmi/pi-agent` is the central lower-layer agent package for Pi. It owns the standard `Agent` facade, persistent transcript state, the default LLM/tool runtime loop, lifecycle events, generic tool protocol, tool registration helpers, orchestration primitives, shared message/subagent contracts, and runtime/backend seams.

Provider adapters and streaming transport live in `@tsuuanmi/pi-ai`. Concrete Pi tools live in higher-level host packages such as `@tsuuanmi/pi`; hosts register those tools with the agent package.

Node-only helpers are available from the `@tsuuanmi/pi-agent/node` subpath.

See [Agent documentation](./docs/agent/agent.md), [Tool Registration](./docs/tool/registry.md), and [Orchestrator update logic](./docs/orchestrator/orchestrator.md) for the standard integration patterns.

## Quick Start

```typescript
import { Agent, createToolRegistry, registerTool } from "@tsuuanmi/pi-agent";
import type { AgentTool } from "@tsuuanmi/pi-agent";
import type { Model } from "@tsuuanmi/pi-ai";

const model: Model<any> = {
  id: "claude-4-sonnet",
  name: "Claude 4 Sonnet",
  api: "anthropic",
  provider: "anthropic",
  contextWindow: 200_000,
};

const hostTools: AgentTool[] = [/* concrete tools owned by the host package */];
const registry = createToolRegistry();
registerTool(registry, hostTools);

const agent = new Agent({
  name: "planner",
  capabilities: ["planning"],
  initialState: {
    systemPrompt: "Plan concise implementation steps.",
    model,
    tools: registry.list(),
  },
});

await agent.prompt("Create a short implementation plan.");
console.log(agent.state.messages.at(-1));
```

## Standard Integration Pattern

High-level packages should integrate with `@tsuuanmi/pi-agent` by following these boundaries:

1. Create or obtain a `Model` and stream transport from `@tsuuanmi/pi-ai`.
2. Define concrete tools in the host package.
3. Register tools with `createToolRegistry()`, `registerTool()`, or `Agent.registerTool()`.
4. Subscribe to `AgentEvent` with `agent.subscribe()` for UI, logs, traces, metrics, and progress state.
5. Use `Agent.run()` for isolated task/orchestration calls and `Agent.prompt()` / `Agent.continue()` for persistent interactive sessions.
6. Provide a custom `AgentRuntime` only when replacing the built-in LLM/tool loop with an external runtime.
7. Import `@tsuuanmi/pi-agent/node` only from Node-specific code.

This keeps agent behavior centralized while allowing applications, extensions, and workflow packages to supply their own tools and runtime integrations.

## Core Concepts

- `Agent`: the single standard Pi agent facade. It wraps state, prompt history, the runtime seam, queues, lifecycle events, tools, and task-oriented `run()` execution.
- `AgentRuntime`: the execution seam for the default LLM/tool loop or external backends. Runtime implementations stream events and finish with one done or error event.
- `AgentTool`: the generic tool protocol implemented by host-owned tools.
- `ToolRegistry`: name-keyed tool registration for hosts and extensions.
- `Task`: tracks UUID-backed IDs, title, description, dependency IDs, requirements, assignee, validated/redacted metadata, status, result, and error.
- `TaskQueue`: owns task snapshots, dependency readiness, queue snapshots, and blocked/skipped lifecycle resolution.
- `Team`: named roster of agents created with `new Team({ name, agents })`, with inter-agent messaging and typed message events.
- `Orchestrator`: strictly plans task DAGs with an explicit coordinator, assigns ready tasks, pipelines newly unblocked work, and executes dependency batches with progress events, trace hooks, abort handling, dispatch gates, budgets, checkpoints, consensus verification, failure policies, and per-task metrics.

## Runtime and Backend Boundary

The default runtime uses `@tsuuanmi/pi-ai` streaming plus registered `AgentTool` instances. External process, protocol, or ACP-style integrations should implement `AgentRuntime` and be supplied through `new Agent({ runtime })`.

Node-specific runtime implementations belong under `@tsuuanmi/pi-agent/node` or in dedicated optional integration packages that depend on `@tsuuanmi/pi-agent` as their contract package. They should not force browser-safe core consumers to install Node-only or protocol-specific dependencies.

## Scheduling

Use `orchestrator.plan(team, goal, { coordinator })` for strict goal-to-DAG planning, then call `orchestrator.run(team, plan.tasks)` explicitly. Planning is abortable and emits strict trace events. Set `schedulingStrategy` on `Orchestrator` or per run. Use `runBudget`, `checkpointStore`, `onTaskVerify`, `createConsensusVerifier`, `onTaskFailure`, and `onTrace` to add production guardrails, resumability, verification, failure classification, and structured telemetry. `onTaskFailure` controls retry/fail/skip/abort decisions. Supported strategies:

- `dependency-first` (default): run tasks that unblock the largest downstream set first.
- `composite`: combine dependency criticality, capability fit, and current agent load.
- `capability-match`: choose agents whose capabilities satisfy task requirements.
- `round-robin`: distribute ready tasks across the roster.
- `least-busy`: choose the agent with the fewest active tasks.

## Attribution

This package's architecture is adapted from `open-multi-agent` under the MIT license. See `NOTICE` for attribution.
