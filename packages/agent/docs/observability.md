# Observability

`@tsuuanmi/pi-agent` currently exposes observability through structured agent lifecycle events and provider request observers. It does not export a standalone OpenTelemetry/Sentry abstraction.

## Agent events

Subscribe with `Agent.subscribe()`:

```typescript
const unsubscribe = agent.subscribe(async (event, signal) => {
  if (event.type === "tool_execution_end") {
    console.log(event.toolName, event.result);
  }
});
```

Listeners are awaited in subscription order and receive the active abort signal.

Core event categories:

- `agent_start` / `agent_end`
- `turn_start` / `turn_end`
- `message_start` / `message_update` / `message_end`
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end`

Use these events to build logs, traces, metrics, UI state, or progress snapshots. See [Types](types.md) for the full `AgentEvent` union.

## Tool execution events

Tool events include stable identifiers and tool metadata:

- `toolCallId`
- `toolName`
- parsed `args`
- streaming update `details`
- final `result`
- `isError`

The subagent progress tracker in [`subagents.md`](subagents.md) consumes this same event shape to retain current tool, recent tools, and recent assistant output.

## Provider request observation

`AgentOptions.providerRequestObserver` is forwarded to the underlying AI stream options. Use it to observe provider request lifecycle details emitted by `@tsuuanmi/pi-ai` without coupling agent event listeners to provider internals.

## Proxy streaming

`streamProxy()` reconstructs assistant partials from server-sent events and encodes proxy/HTTP/abort failures as assistant stream error events instead of throwing. See [Proxy Stream](proxy.md).

## Recommended integration pattern

- Subscribe once at the application boundary.
- Convert events into your telemetry format outside this package.
- Avoid storing raw prompt/tool payloads unless your privacy policy allows it.
- Treat `agent_end` as the final event for a run; the agent becomes idle after all awaited `agent_end` listeners settle.
