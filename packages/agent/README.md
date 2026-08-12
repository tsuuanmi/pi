# @tsuuanmi/pi-agent

Standard agent behavior, tool, and message contracts for Pi. Built on `@tsuuanmi/pi-ai` provider/model transport contracts.

## Installation

```bash
npm install @tsuuanmi/pi-agent
```

## Package Scope

`@tsuuanmi/pi-agent` is the standard agent package for Pi. It owns the `Agent` facade, transcript state, the model/tool loop, lifecycle events, the `Tool` and `ToolRegistry` APIs, and shared message/tool contracts.

Provider adapters and streaming transport live in `@tsuuanmi/pi-ai`. Concrete tools live in host packages; Pi registers those tools with the agent package.

Node-only helpers are available from the `@tsuuanmi/pi-agent/node` subpath.

`AgentEvent` and `EventSink` are the public agent-loop event contracts. Hosts may consume or map them, but session, task-queue, workflow, and UI events remain owned by their respective layers.

Receipt ownership is execution-scoped: `StructuredReceipt` is the public envelope and `createToolReceipt()` creates tool-execution evidence. These contracts do not include task routing, retries, workflow gates, or workflow artifact state.

See [Agent documentation](./docs/agent/index.md) and [Tool Registration](./docs/tool/registry.md) for the standard integration patterns. Task, team, and orchestration contracts live in `@tsuuanmi/pi-orchestrator`.

## Quick Start

```typescript
import { Agent, Tool, ToolRegistry, type Model } from "@tsuuanmi/pi-agent";
import { Type } from "typebox";

const model: Model<any> = {
  id: "claude-4-sonnet",
  name: "Claude 4 Sonnet",
  api: "anthropic",
  provider: "anthropic",
  contextWindow: 200_000,
};

const hostTools: Tool[] = [
  Tool.define({
    name: "example",
    description: "Example host-owned tool",
    label: "Example",
    parameters: Type.Object({ input: Type.String() }),
    async execute(_toolCallId, args) {
      return { content: [{ type: "text", text: args.input }], details: {} };
    },
  }),
];
const registry = new ToolRegistry(hostTools);

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

1. Create or obtain a `Model` and stream transport from `@tsuuanmi/pi-agent` and `@tsuuanmi/pi-ai`.
2. Define concrete tools in the host package.
3. Register tools with `ToolRegistry.register()` and pass the active list to `Agent`.
4. Subscribe to `AgentEvent` with `agent.subscribe()` for UI, logs, traces, metrics, and progress state.
5. Use `Agent.run()` for isolated task/orchestration calls and `Agent.prompt()` / `Agent.continue()` for persistent interactive sessions.
6. Provide a custom `stream` function only when replacing the provider transport.
7. Import `@tsuuanmi/pi-agent/node` only from Node-specific code.

This keeps agent behavior centralized while allowing applications, extensions, and workflow packages to supply their own tools and provider stream function.

## Core Concepts

- `Agent`: the single standard Pi agent facade. It wraps state, prompt history, the model/tool loop, queues, lifecycle events, tools, and task-oriented `run()` execution.
- `Tool`: validates and owns one executable tool declaration with optional output limits and details validation.
- `ContextToolSpec`: lets hosts add a typed execution context without copying the canonical `ToolSpec` contract.
- `ToolRegistry`: owns name-keyed tool registration for hosts and extensions.
- `@tsuuanmi/pi-orchestrator`: owns task, team, and orchestration contracts built on top of `Agent`.

## Subagent and Orchestration Boundary

Pi owns the main application session and supplies generic session services. Use `@tsuuanmi/pi-orchestrator` for session-aware subagent execution, lifecycle controls, task dependencies, routing, retries, queues, and agent collaboration.

## Execution Boundary

`Agent` owns the complete model/tool loop. It calls `@tsuuanmi/pi-ai` through its configured `stream` function, executes the registered tools, updates the transcript, and emits lifecycle events. There is no public runtime or backend injection layer.

The `@tsuuanmi/pi-agent/node` entry point contains only Node-specific process, shell, path, JSONL, and file-mutation utilities. It does not replace the agent loop.
