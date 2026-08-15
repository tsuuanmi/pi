# Hook and Event Boundaries

## Decision

A **hook** is a control point. It may block, cancel, transform, replace, or handle an operation.

An **event** is an observation point. It reports something that happened; callback return values are ignored.

Ownership follows the lifecycle being controlled or observed, not the package that consumes it.

## Package ownership

| Package | Owns events | Owns hooks |
| --- | --- | --- |
| `@tsuuanmi/pi-agent` | Canonical `AgentEvent` execution lifecycle | `AgentHook` and its registry |
| `@tsuuanmi/pi` | Session/host events and extension observation | Session, input, prompt, provider, message, tool, and shell extension hooks |
| `@tsuuanmi/pi-orchestrator` | Orchestration progress, queue, trace, scheduling, and task notifications | Verification, consequential-task approval, retry classification, failure handling, and dispatch approval |
| `@tsuuanmi/pi-workflows` | Workflow-owned mappings such as team events | Workflow policy registered through Pi and Orchestrator contracts |

The dependency direction remains:

```text
pi-ai -> pi-agent -> pi
                  -> pi-orchestrator
pi + pi-orchestrator -> pi-workflows
```

`pi-agent` must not import Pi extension, session, UI, or workflow types.

## Agent core boundary

`@tsuuanmi/pi-agent` owns:

- `AgentEvent` in `packages/agent/src/events.ts`;
- `AgentHook` in `packages/agent/src/agent/hooks.ts`;
- hook registration and deterministic composition;
- model/tool-loop timing.

This ownership is intentional. Pi, Orchestrator, and Workflows all build on the Agent core, so moving its hook registry into Pi would invert the dependency graph.

Pi forwards canonical `AgentEvent` values to extension observers unchanged. It does not redefine Agent payloads, add `turnIndex`/`timestamp`, or remove fields such as `ToolExecutionMeta`.

## Pi extension boundary

The public API makes the distinction explicit:

```typescript
pi.on("agent_start", handler);          // observation
pi.on("session_start", handler);        // observation
pi.onHook("before_agent_start", hook);  // control
pi.onHook("tool_call", hook);           // control
```

`ExtensionEvent` contains observer-only Agent and Pi host events. `ExtensionHookMap` contains control hooks and result contracts. Runtime extension records keep `eventHandlers` and `hookHandlers` in separate registries, and dispatch uses separate event and hook modules.

### Pi-owned events

Pi owns events whose lifecycle belongs to the host:

- session start, compaction completion, tree navigation, and shutdown;
- model and thinking-level selection;
- provider response observation.

### Pi-owned hooks

Pi owns control points that require host/session context:

- `resources_discover`;
- `session_before_switch`, `session_before_compact`, `session_before_tree`;
- `input` and `user_bash`;
- `before_agent_start`, `context`, `before_provider_request`, `message_end`;
- `tool_call` and `tool_result`.

`message_end` intentionally exists in both APIs. The hook may replace the finalized message; the event then reports the resulting canonical Agent message.

### Agent bridge

`packages/pi/src/hooks/agent-bridge.ts` is the sole adapter from Pi tool hooks to Agent hooks:

```text
Pi tool_call hook   -> AgentHook.beforeToolCall
Pi tool_result hook -> AgentHook.afterToolCall
```

Pi owns extension payloads and policy. Agent owns tool-loop timing and hook composition. The bridge does not create a second tool lifecycle.

## Session event boundary

`AgentSessionEvent` is a host-facing union for Pi modes and SDK consumers. It contains:

- only the Agent events consumed by Pi modes;
- an explicit `agent_end` adaptation with `willRetry`;
- Pi-owned queue, compaction, retry, session-info, and thinking-level events.

It is not an alias for the complete `AgentEvent` union. Extensions receive the complete Agent observer stream independently through `ExtensionAPI.on(...)`.

`before_agent_start` remains a Pi hook rather than an Agent event. It runs after prompt expansion and before the Agent loop, so it can inject a custom message or replace the system prompt. Agent `agent_start` is emitted only after that hook completes.

## Orchestrator boundary

`OrchestratorConfig` and `RunTeamOptions` separate callbacks structurally:

```typescript
{
  events: {
    progress,
    queue,
    schedulingWarning,
    trace,
    taskStart,
    taskComplete,
  },
  hooks: {
    verifyTask,
    approveConsequentialTask,
    classifyTaskRetry,
    handleTaskFailure,
    approveTaskDispatch,
  },
}
```

Run-level values override constructor defaults by key. Event handlers report orchestration state; hooks decide execution policy.

## Workflow boundary

Workflows registers directly against `Pick<ExtensionAPI, "on" | "onHook">`. It imports Pi payload/result contracts instead of redeclaring them. Workflow-owned team events remain explicit mappings from Orchestrator queue events.

## EventBus boundary

Pi's `EventBus` is an untyped extension-to-extension custom channel. It is not another Agent or session lifecycle stream and must not be used to mirror canonical host events.

## Review rule

When adding a callback, ask:

1. Can its return value change execution? If yes, it is a hook.
2. Which package owns the lifecycle or decision?
3. Can a consumer import the owner's contract instead of redefining it?
4. Is an adapter explicit and one-directional?
5. Are observation and control stored, dispatched, tested, and documented separately?
