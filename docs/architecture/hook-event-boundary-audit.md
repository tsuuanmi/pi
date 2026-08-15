# Hook/Event Boundary Audit

**Status:** Resolved.

This audit originally identified six boundary problems across Agent, Pi, Orchestrator, and Workflows. The implementation is recorded in [Hook/Event Boundary Implementation Plan](hook-event-boundary-implementation-plan.md).

## Resolution summary

| Finding | Resolution |
| --- | --- |
| Agent lifecycle was declared three times | `AgentEvent` is authoritative; Pi forwards it unchanged. |
| Session and extension contracts overlapped | `AgentSessionEvent` is a narrow host union; `ExtensionEvent` is canonical Agent events plus Pi host events. |
| Agent and host lifecycle paths were unclear | Agent events use one forwarding path; `before_agent_start` is explicitly a Pi control hook. |
| Workflows declared a fourth payload surface | Workflows imports Pi contracts and accepts `Pick<ExtensionAPI, "on" | "onHook">`. |
| Control callbacks were named and registered as events | `ExtensionAPI.on(...)` is observer-only; `onHook(...)` registers control hooks. |
| Session events re-exported the whole Agent union | Pi selects only Agent events consumed by host modes and adapts `agent_end` explicitly. |

## Finding 1 — Duplicate Agent lifecycle payloads

### Original problem

Pi re-declared Agent lifecycle payloads in both `AgentSessionEvent` and `ExtensionEvent`, then `_emitExtensionEvent()` manually remapped every event. The remapping added unused `turnIndex`/`timestamp` fields and dropped `tool_execution_end.meta`.

### Resolution

- `packages/agent/src/events.ts` remains the sole Agent lifecycle definition.
- `packages/pi/src/hooks/events.ts` composes `ExtensionEvent` from `AgentEvent` plus Pi-owned host events.
- `AgentSession._forwardAgentEvent()` forwards the original event object after any `message_end` control hook.
- Pi no longer adds `turnIndex`/`timestamp` or removes Agent fields.

## Finding 2 — Session and extension overlap

### Original problem

`AgentSessionEvent` and `ExtensionEvent` both represented Agent execution while diverging on host events and payload shapes.

### Resolution

- `ExtensionEvent` is the complete extension observation stream: canonical Agent events plus Pi host events.
- `AgentSessionEvent` is the host-mode stream: selected Agent events, adapted `agent_end`, and Pi queue/compaction/retry/session events.
- Session ownership, not consumer convenience, determines which host events belong in the session union.

## Finding 3 — Unclear lifecycle paths

### Original problem

`before_agent_start` was described as an extension event even though it ran outside the Agent observer stream and changed prompt inputs.

### Resolution

`before_agent_start` is an explicit Pi hook registered with `onHook(...)`. Ordering is:

```text
input hook
prompt/skill expansion
before_agent_start hook
Agent agent_start event
Agent turn/message/tool events
Agent agent_end event
```

All Agent events pass through `_forwardAgentEvent()`. Pi host hooks remain in their owning host operations instead of pretending to be Agent events.

## Finding 4 — Workflows duplicated Pi contracts

### Original problem

`packages/workflows/src/hooks.ts` declared `WorkflowHookHost`, generic workflow handler types, and hand-written tool payload subsets.

### Resolution

The duplicate surface was removed. `registerWorkflowHooks()` accepts the exact narrow capability `Pick<ExtensionAPI, "on" | "onHook">`, uses `ExtensionContext`, and imports `ToolResultHook`/`ToolResultHookResult` from Pi.

## Finding 5 — Hooks were exposed as events

### Original problem

The single `ExtensionAPI.on(...)` method mixed observations with callbacks whose results changed behavior.

### Resolution

Pi now has separate contracts, registries, and dispatch paths:

- `packages/pi/src/hooks/events.ts`: observer-only event types;
- `packages/pi/src/hooks/hook-types.ts`: hook payload/result map;
- `packages/pi/src/hooks/event-dispatch.ts`: event dispatch;
- `packages/pi/src/hooks/hook-dispatch.ts`: hook reducers;
- `Extension.eventHandlers` and `Extension.hookHandlers`: separate storage;
- `ExtensionAPI.on(...)` and `ExtensionAPI.onHook(...)`: separate public registration.

The old mixed registry, generic `emit(...)`, hook-like event type names, and monolithic dispatch module were removed without compatibility aliases.

## Finding 6 — Broad session coupling

### Original problem

`AgentSessionEvent = Exclude<AgentEvent, { type: "agent_end" }> | ...` coupled every Pi session consumer to every Agent event.

### Resolution

`SessionAgentEvent` selects only:

- `agent_start`;
- `turn_end`;
- message start/update/end;
- tool execution start/update/end;
- `structured_output`.

`agent_end` is represented by `AgentSessionEndEvent` with `willRetry`. Agent status, trace, warning, loop, turn-start, and max-turn observations remain available through the canonical extension Agent event stream.

## Additional Orchestrator cleanup

The audit also exposed mixed observation and decision callbacks in `OrchestratorConfig` and `RunTeamOptions`. They now use:

- `events`: `progress`, `queue`, `schedulingWarning`, `trace`, `taskStart`, `taskComplete`;
- `hooks`: `verifyTask`, `approveConsequentialTask`, `classifyTaskRetry`, `handleTaskFailure`, `approveTaskDispatch`.

Run-level values override constructor defaults by key. The flat callback surface was removed.

## Verification coverage

The implementation is covered by:

- extension public API, discovery, runner, input, and session runtime tests;
- canonical Agent event forwarding tests, including `ToolExecutionMeta` preservation;
- hook-before-event ordering tests for `message_end`;
- tool blocking/result transformation integration tests;
- Orchestrator event/hook configuration tests;
- Workflows adapter and team event-mapper tests;
- Internet extension hook registration tests.

See [Hooks and Events Reference](hooks-and-events-reference.md) for the final inventory.
