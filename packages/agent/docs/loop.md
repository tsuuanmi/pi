# Agent Loop

The loop is an internal implementation detail of `Agent`. It sends prompts to the provider, executes tool calls, updates the transcript, and emits lifecycle events. Callers use `Agent.prompt()`, `Agent.continue()`, or `Agent.run()` rather than invoking the loop directly.

## Core behavior

### Outer and inner loops

The agent uses two nested loops:

1. **Inner loop:** processes tool calls and steering messages until no more are pending.
2. **Outer loop:** checks for follow-up messages after the agent would otherwise stop.

### Steering messages

Steering messages are injected after tool calls finish. `Agent` polls its steering queue at loop entry and after each turn's tool calls.

### Follow-up messages

Follow-up messages are checked only after the agent would otherwise stop. If any exist, the loop starts another turn.

### Tool execution

Tool calls from an assistant message are executed according to `toolExecution`:

- **`parallel`** (default): preflight calls sequentially, then execute allowed tools concurrently. `maxToolConcurrency` bounds concurrency.
- **`sequential`**: prepare, execute, and finalize each call before starting the next.

A tool can override the mode with `tool.executionMode = "sequential"`. If any call in a batch targets a sequential tool, the batch runs sequentially.

`maxToolOutputChars` limits retained text from each tool result. A tool can set `maxOutputChars` for its own limit. Truncated text receives a deterministic marker and the final tool event reports truncation counts.

### Abort handling

When the active signal aborts:

- Tool execution checks the signal before and during execution.
- Aborted calls return an error tool result with `Operation aborted`.
- Provider aborts produce an assistant message with `stopReason: "aborted"`.
- The loop emits `turn_end` and `agent_end` without executing more tools or polling queues.

Terminal shutdown is owned by `Agent`. After `dispose()`, new work is rejected.

### Error handling

Provider failures produce an assistant message with `stopReason: "error"` and `errorMessage`. The loop emits the normal terminal events so `Agent` can update its state and notify listeners.

## Events

The loop emits these `AgentEvent` types:

| Event | Description |
|-------|-------------|
| `agent_start` | Loop begins |
| `agent_end` | Loop finishes and includes new messages |
| `turn_start` | Assistant turn begins |
| `turn_end` | Turn completes with its message and tool results |
| `message_start` | Message enters the context |
| `message_update` | Streaming assistant delta |
| `message_end` | Message is finalized |
| `tool_execution_start` | Tool call begins |
| `tool_execution_update` | Partial tool result update |
| `tool_execution_end` | Tool call finishes |

## Context transforms

The loop applies transforms in order:

1. **`transformContext`** operates on `Message[]` for pruning or injection and receives the abort signal.
2. **`convertToLlm`** converts agent messages into provider-compatible messages.

These callbacks are owned by `Agent` configuration and run inside the agent boundary.

## Determinism and provider observation

Pass `now` to control timestamps and trace spans. `createRequestId` controls provider request ids. Defaults use `Date.now()` and the `llm_<timestamp>_<sequence>` format.

`requestTimeoutMs` bounds each provider request. `providerRequestObserver` receives request start, payload, response, and completion callbacks. Observer failures do not affect the run.

## Execution hooks

Hooks are registered with `Agent.registerHook()` and run in registration order. They observe or control execution without exposing the internal loop.

### `prepareNextTurn`

Runs after `turn_end` and before the next provider request. It can replace the context, model, or thinking level for the next turn.

### `beforeToolCall`

Runs after arguments are validated and before execution:

```typescript
agent.registerHook({
  name: "policy",
  beforeToolCall: async (context) => {
    if (isDangerous(context.toolCall.name)) {
      return { block: true, reason: "Dangerous operation blocked" };
    }
    return undefined;
  },
});
```

Returning `{ block: true }` prevents execution and produces a blocked error tool result.

### `afterToolCall`

Runs after a tool finishes and before the final tool event and result message are emitted. It can replace content, details, error state, or the termination hint. Invalid details produce a deterministic failed tool result. Hook failures also become error tool results.
