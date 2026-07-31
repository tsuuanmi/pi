# @tsuuanmi/pi-agent

Standard agent behavior, runtime, tool, message, and subagent contracts for Pi. Built on `@tsuuanmi/pi-ai` provider/model transport contracts.

## Installation

```bash
npm install @tsuuanmi/pi-agent
```

## Package Scope

`@tsuuanmi/pi-agent` is the standard agent protocol/runtime package for Pi. It owns the `Agent` facade, transcript state, the default runtime loop, lifecycle events, the generic tool protocol, tool registration helpers, shared message/subagent contracts, and runtime/backend seams.

Provider adapters and streaming transport live in `@tsuuanmi/pi-ai`. Concrete tools live in host packages; Pi registers those tools with the agent package.

Node-only helpers are available from the `@tsuuanmi/pi-agent/node` subpath.

See [Agent documentation](./docs/agent/index.md) and [Tool Registration](./docs/tool/registry.md) for the standard integration patterns. Task, team, and orchestration contracts live in `@tsuuanmi/pi-orchestrator`.

## Quick Start

```typescript
import { Agent, createToolRegistry, defineTool, registerTool } from "@tsuuanmi/pi-agent";
import type { AgentTool } from "@tsuuanmi/pi-agent";
import type { Model } from "@tsuuanmi/pi-ai";
import { Type } from "typebox";

const model: Model<any> = {
  id: "claude-4-sonnet",
  name: "Claude 4 Sonnet",
  api: "anthropic",
  provider: "anthropic",
  contextWindow: 200_000,
};

const hostTools: AgentTool[] = [
  defineTool({
    name: "example",
    description: "Example host-owned tool",
    label: "Example",
    parameters: Type.Object({ input: Type.String() }),
    async execute(_toolCallId, args) {
      return { content: [{ type: "text", text: args.input }], details: {} };
    },
  }),
];
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
6. Provide a custom `AgentRuntime` only when replacing the default runtime with an external runtime.
7. Import `@tsuuanmi/pi-agent/node` only from Node-specific code.

This keeps agent behavior centralized while allowing applications, extensions, and workflow packages to supply their own tools and runtime integrations.

## Core Concepts

- `Agent`: the single standard Pi agent facade. It wraps state, prompt history, the runtime seam, queues, lifecycle events, tools, and task-oriented `run()` execution.
- `AgentRuntime`: the execution seam for the default LLM/tool loop or external backends. Runtime implementations stream events and finish with one done or error event.
- `AgentTool`: the generic tool protocol implemented by host-owned tools, with optional per-tool output limits and details validation.
- `defineTool`: validates required host-owned tool declaration fields without mutating the tool.
- `ToolRegistry`: name-keyed tool registration for hosts and extensions.
- `@tsuuanmi/pi-orchestrator`: owns task, team, and orchestration contracts built on top of `Agent`.

## Runtime and Backend Boundary

The default runtime uses `@tsuuanmi/pi-ai` streaming plus registered `AgentTool` instances supplied by the host package. External process, protocol, or ACP-style integrations should implement `AgentRuntime` and be supplied through `new Agent({ runtime })`.

Node-specific runtime implementations belong under `@tsuuanmi/pi-agent/node` or in dedicated optional integration packages that depend on `@tsuuanmi/pi-agent` as their contract package. They should not force browser-safe core consumers to install Node-only or protocol-specific dependencies.
