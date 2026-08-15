# Hook/Event Boundary Implementation Plan

**Status:** Implemented.

This record describes the completed implementation of the findings in [Hook/Event Boundary Audit](hook-event-boundary-audit.md).

## Final decisions

1. `AgentEvent` in `@tsuuanmi/pi-agent` is the sole Agent lifecycle contract.
2. Pi forwards Agent events unchanged to extension observers.
3. The unused Pi-only `turnIndex` and `timestamp` enrichments were removed; no metadata envelope was added.
4. `tool_execution_end.meta` and `loop_detected.result` remain intact because the canonical payload is forwarded.
5. Extension observations use `ExtensionAPI.on(...)`; control hooks use `ExtensionAPI.onHook(...)`.
6. The public API change is intentionally breaking. No alias, dual registration path, or compatibility map remains.
7. Orchestrator callbacks are grouped under `events` and `hooks`; the flat mixed surface was removed.
8. Workflows and Internet consume the owning Pi contracts directly.

## Completed work

### 1. Canonical Agent event boundary

Owner: `@tsuuanmi/pi-agent`

`packages/agent/src/events.ts` remains authoritative. Pi no longer maintains per-Agent-event interfaces or a field-by-field conversion switch.

Pi's extension observer union is now:

```typescript
type ExtensionEvent = AgentEvent | HostEvent;
```

`AgentSession._forwardAgentEvent()` performs only one control step before forwarding: a `message_end` hook may replace the finalized same-role message. The resulting canonical event is then sent to extension observers.

### 2. Narrow Pi session stream

Owner: `@tsuuanmi/pi`

`packages/pi/src/runtime/session/types.ts` now defines:

- `SessionAgentEvent`: the Agent event subset consumed by Pi modes;
- `AgentSessionEndEvent`: canonical Agent end plus `willRetry`;
- `AgentSessionEvent`: the selected Agent events plus Pi-owned host events;
- `isSessionAgentEvent()`: the explicit runtime forwarding guard.

This prevents Agent warnings, traces, statuses, loop notifications, turn starts, and max-turn notices from coupling every Pi session consumer. Those values remain available to extension observers through `AgentEvent`.

### 3. Separate Pi event and hook contracts

Owner: `@tsuuanmi/pi`

| Responsibility | File |
| --- | --- |
| Observer event types | `packages/pi/src/hooks/events.ts` |
| Control hook payload/result map | `packages/pi/src/hooks/hook-types.ts` |
| Event registration API | `packages/pi/src/hooks/api.ts` (`ExtensionEventAPI`) |
| Hook registration API | `packages/pi/src/hooks/api.ts` (`ExtensionHookAPI`) |
| Separate registration/storage | `packages/pi/src/hooks/register.ts`, `packages/pi/src/api/extension-types.ts` |
| Observation dispatch | `packages/pi/src/hooks/event-dispatch.ts` |
| Control dispatch/reducers | `packages/pi/src/hooks/hook-dispatch.ts` |
| Shared dispatch state/error reporting | `packages/pi/src/hooks/dispatch-state.ts` |
| Runtime facade | `packages/pi/src/runtime/extensions/runner.ts` |

The old mixed `handlers` map, `emit(...)` method, `hasHandlers(...)` method, and monolithic `hooks/dispatch.ts` were removed.

### 4. Explicit public API

The supported registration forms are:

```typescript
pi.on("agent_start", eventHandler);
pi.on("session_start", eventHandler);
pi.onHook("before_agent_start", hookHandler);
pi.onHook("tool_call", hookHandler);
```

Hook-like payload types were renamed accordingly, including:

- `InputHook` / `InputHookResult`;
- `ContextHook` / `ContextHookResult`;
- `BeforeAgentStartHook` / `BeforeAgentStartHookResult`;
- `ToolCallHook` / `ToolCallHookResult`;
- `ToolResultHook` / `ToolResultHookResult`;
- session-before and resource hook types;
- `isToolCallHookType()`.

The extension public entry point exports observer event types and hook contracts from their owning modules.

### 5. Agent tool bridge

Owner: `packages/pi/src/hooks/agent-bridge.ts`

The bridge remains the sole adapter:

```text
tool_call   -> AgentHook.beforeToolCall
tool_result -> AgentHook.afterToolCall
```

It now checks the hook registry explicitly. Tool-call hook failures still block execution; tool-result hook transformations still compose before the Agent emits its final result event.

### 6. Orchestrator event/hook grouping

Owner: `@tsuuanmi/pi-orchestrator`

`OrchestratorConfig` and `RunTeamOptions` now accept:

```typescript
{
  events?: OrchestratorEventHandlers;
  hooks?: OrchestratorHooks;
}
```

Event keys are `progress`, `queue`, `schedulingWarning`, `trace`, `taskStart`, and `taskComplete`.

Hook keys are `verifyTask`, `approveConsequentialTask`, `classifyTaskRetry`, `handleTaskFailure`, and `approveTaskDispatch`.

`PlanOptions` and `ConsensusVerifierOptions` expose `events.trace`. Run-level groups override constructor defaults by key through one merged run configuration.

### 7. Workflow and Internet adapters

Owners: `@tsuuanmi/pi-workflows` and `@tsuuanmi/pi-internet`

`registerWorkflowHooks()` and `registerInternetHooks()` accept `Pick<ExtensionAPI, "on" | "onHook">`. Their custom host and handler payload declarations were removed. Workflow observer registrations and policy hooks are visibly separate.

The team adapter maps Orchestrator queue events through `events.queue`; workflow-owned `TeamWorkflowEvent` remains a pure explicit mapping.

### 8. Documentation and changelogs

Updated architecture, Agent-session, extension authoring, compaction, custom provider, Orchestrator, Workflows, and package reference docs to use the final contracts. Changelogs record the breaking public API changes.

## Behavioral invariants

The refactor preserves:

- extension load-order execution;
- event error isolation;
- hook-specific cancellation, blocking, transformation, and patch semantics;
- `message_end` same-role validation;
- tool hook bridge failure behavior;
- session shutdown ordering;
- Orchestrator scheduling and task-decision behavior;
- workflow event mapping.

Intentional changes are limited to contract clarity and removal of unused/duplicate surfaces:

- no extension `turnIndex`/`timestamp` enrichment;
- complete canonical Agent event forwarding to extensions;
- narrower `AgentSessionEvent`;
- breaking `onHook(...)` registration;
- grouped Orchestrator callbacks.

## Acceptance criteria

- [x] Agent lifecycle payloads have one authoritative definition.
- [x] Pi session events and extension events have ownership-based boundaries.
- [x] Events and hooks have separate public methods, types, registries, and dispatch paths.
- [x] `before_agent_start` is an explicit pre-run Pi hook.
- [x] Tool control crosses the Agent boundary only through `agent-bridge.ts`.
- [x] Orchestrator observations and decisions are separately grouped and typed.
- [x] Workflows imports Pi contracts instead of duplicating them.
- [x] Obsolete mixed APIs and modules are removed without compatibility scaffolding.
- [x] Tests cover registration separation, ordering, canonical payload forwarding, control behavior, and consumer adapters.
- [x] Public documentation and changelogs match the implementation.

## Rollback boundary

The implementation is a single architectural contract change. A rollback must restore the prior public API and all consumers together; partial restoration would reintroduce mixed registries and divergent event payloads. No runtime compatibility layer is intentionally available.
