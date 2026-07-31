# Observability

`@tsuuanmi/pi-agent` currently exposes observability through structured agent lifecycle events and provider request observers. It does not export a standalone OpenTelemetry/Sentry abstraction.

## Agent events

Subscribe with `Agent.subscribe()`:

```typescript
const unsubscribe = agent.subscribe(async (event, signal) => {
  if (event.type === "tool_execution_end") {
    console.log(event.toolName, event.meta.status, event.meta.span, event.result);
  }
});
```

Listeners are awaited in subscription order and receive the active abort signal.

Core event categories:

- `agent_start` / `agent_end`
- `turn_start` / `turn_end`
- `message_start` / `message_update` / `message_end`
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end`

Use these events to build logs, traces, metrics, UI state, or progress snapshots. See [Types](../../types.md) for related public types.

## Tool execution events

Tool events include stable identifiers and tool metadata:

- `toolCallId`
- `toolName`
- parsed `args`
- streaming update `details`
- final `result`
- `isError`
- final `meta.status`: `completed`, `failed`, `blocked`, or `aborted`
- final `meta.span` with tool id, name, timing, duration, and trace status
- truncation metadata when output limits truncate tool text

The subagent progress tracker in [`subagents/index.md`](../../subagents/index.md) consumes this same event shape to retain current tool, recent tools, and recent assistant output.

## Trace spans

Runtime traces and final tool events carry additive `span` metadata:

- `kind`: `request` or `tool`
- `id`: provider request id or tool call id
- `name`: span name
- `startedAt` / `endedAt` / `durationMs`
- `status`: `ok`, `error`, `aborted`, `timeout`, or `blocked`

Spans are protocol-level observability data. Concrete tool implementations remain owned and registered by host packages.

## Provider request observation

`AgentOptions.providerRequestObserver` is forwarded to the underlying AI stream options. Use it to observe provider request lifecycle details emitted by `@tsuuanmi/pi-ai` without coupling agent event listeners to provider internals. Completion events include the same request `span` emitted through runtime traces.

## Recommended integration pattern

- Subscribe once at the application boundary.
- Convert events into your telemetry format outside this package.
- Keep UI/progress state in higher-level packages by consuming `AgentEvent` rather than forking the runtime loop.
- Observe provider request lifecycle with `providerRequestObserver` when provider-level details are needed.
- Observe process/protocol/ACP-style runtimes through their `RuntimeEvent` backend, warning, trace, done, and error events.
- Avoid storing raw prompt/tool payloads unless your privacy policy allows it.
- Treat `agent_end` as the final event for a run; the agent becomes idle after all awaited `agent_end` listeners settle.
