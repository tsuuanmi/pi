# Agent Architecture and Extension Boundaries

This document is the initial architecture overview for `@tsuuanmi/pi-agent`. It defines the package boundary before the detailed hook, event, tool, and orchestration contracts are refined.

## Core principle

`@tsuuanmi/pi-agent` owns the host-neutral Agent and Tool core. It defines and implements the lifecycle boundaries that other packages consume:

- `Agent` owns the model/tool loop, transcript state, queues, abort behavior, and execution invariants.
- `Tool` and `ToolRegistry` define how executable capabilities are described, validated, registered, and invoked.
- `AgentHook` defines control points where a caller may authorize, transform, or prepare Agent execution.
- `AgentEvent` defines the lifecycle and observability output produced by the Agent.

Higher-level packages add concrete capabilities and higher-level policy through the public API. They do not copy or replace the Agent loop.

## Input and output boundaries

| Boundary | Direction | Purpose | Example |
| --- | --- | --- | --- |
| Agent API | Caller -> Agent | Start or control execution | `prompt()`, `run()`, `continue()`, `abort()` |
| Agent hook | Agent -> registered callback | Guard or change execution | Block a tool call or transform a tool result |
| Agent event | Agent -> subscriber | Observe execution | `tool_execution_end`, `message_end`, `agent_end` |
| Tool contract | Agent -> registered tool | Execute a capability | A host-provided `bash` or `read` tool |

A hook is a control input to the Agent. An event is an observation emitted by the Agent. If a callback must block or transform execution, it is a hook even if a higher-level package exposes it through an event-style API.

## Package ownership

| Package | Owns | May add |
| --- | --- | --- |
| `@tsuuanmi/pi-agent` | Agent and Tool behavior, core lifecycle, hook invocation, event emission, and host-neutral contracts | Core hooks and events for lifecycle concepts owned by the Agent |
| `@tsuuanmi/pi-orchestrator` | Tasks, teams, routing, retries, verification, queues, and checkpoints | Orchestrator-specific hooks and events such as task progress or retry decisions |
| `@tsuuanmi/pi` | Sessions, persistence, UI, extensions, concrete tools, and host policy | Pi/session/extension hooks and events, plus adapters to Agent hooks and events |
| Workflow and application packages | Domain-specific policy and composition | Domain-specific agents, tools, hooks, and events within their own boundary |

The Agent package must remain independent of `@tsuuanmi/pi`, `@tsuuanmi/pi-orchestrator`, UI code, session storage, and provider-specific host policy.

## What other packages can extend

### Register an existing Agent hook

A package should register an `AgentHook` when its behavior fits an existing Agent lifecycle point:

```typescript
agent.registerHook({
  name: "host.tool-policy",
  beforeToolCall: async ({ toolCall }) => {
    if (toolCall.name === "restricted_tool") {
      return { block: true, reason: "Tool is disabled by host policy" };
    }
    return undefined;
  },
});
```

The Agent owns invocation order, blocking behavior, result composition, and error handling. The registering package owns the policy implemented by the hook.

### Subscribe to an existing Agent event

A package should subscribe to `AgentEvent` when it only needs to observe Agent execution:

```typescript
const unsubscribe = agent.subscribe(async (event) => {
  if (event.type === "tool_execution_end") {
    // Update UI, metrics, persistence, or tracing in the host package.
  }
});
```

The Agent owns event timing and ordering. The subscriber owns the resulting UI, telemetry, persistence, or progress state.

### Supply concrete tools or configured agents

Host packages provide concrete `Tool` implementations and register them with the Agent. A specialized agent should normally be a configured `Agent`, a factory, or a small wrapper around `Agent`; it should not duplicate the model/tool loop.

## When to define a new hook or event

Use an existing Agent hook or event when the lifecycle belongs to the Agent. Add a new core hook or event to `@tsuuanmi/pi-agent` only when all of these are true:

1. The lifecycle point is owned by the Agent core.
2. The behavior is useful to more than one host or integration.
3. The contract can remain host-neutral.
4. The Agent can guarantee its timing, ordering, and error semantics.

Define a package-local hook or event when the lifecycle belongs to that package instead:

- An orchestrator task retry is an orchestrator lifecycle, not an Agent lifecycle.
- A persisted session event is a Pi session lifecycle, not an Agent lifecycle.
- A UI event is owned by the UI or host package.

Package-local contracts can consume or adapt Agent contracts. They should not add unrelated concepts to the `AgentEvent` union or require the Agent to know about their package.

## Core versus package-specific contracts

The core `AgentEvent` and `AgentHook` contracts should stay small, typed, and host-neutral. Higher-level packages should use their own event types for their own lifecycles:

```text
AgentEvent
  -> Pi session/extension events
  -> Orchestrator task/team events
  -> Application UI and telemetry events
```

Adapters are the intended connection between these layers. For example, Pi can map extension `tool_call` and `tool_result` handlers to an Agent `beforeToolCall` or `afterToolCall` hook, and can map Agent events to session and extension events.

Do not create a global event bus or a universal hook type that contains every Agent, session, task, team, and UI concern. Keep registration scoped to the owning Agent, session, orchestrator, or application.

## Current implementation mapping

The current implementation follows this boundary:

- `src/agent/index.ts` owns Agent lifecycle and loop integration.
- `src/loop.ts` owns turn orchestration.
- `src/agent/provider.ts` owns provider response streaming.
- `src/agent/tool-execution.ts` owns tool-call preparation and execution.
- `src/agent/trace.ts` owns internal timing and trace-span helpers.
- `src/hooks.ts` defines public Agent hook contracts.
- `src/events.ts` defines public Agent events.
- `src/hook-adapter.ts` combines registered hooks into loop callbacks.
- `@tsuuanmi/pi` uses `src/hooks.ts` through `packages/pi/src/hooks/agent-bridge.ts` and consumes Agent events in its session runtime.
- `@tsuuanmi/pi-orchestrator` calls `Agent.run()` and owns task-level execution policy.

Detailed API documentation and any contract changes should be planned against this boundary rather than moving host-specific behavior into the Agent core.
