# Agent Loop

The low-level agent loop that processes prompts through the LLM and executes tool calls.

## Core Functions

### `agentLoop()`

Start an agent loop with a new prompt message:

```typescript
import { agentLoop } from "@tsuuanmi/pi-agent";

const stream = agentLoop(
  prompts,    // AgentMessage[]
  context,    // AgentContext
  config,     // AgentLoopConfig
  signal,     // AbortSignal (optional)
  streamFn,   // StreamFn (optional)
);
```

Returns an `EventStream<AgentEvent, AgentMessage[]>`. The prompt is added to the context and events are emitted for it.

### `agentLoopContinue()`

Continue an agent loop from the current context without adding a new message. Used for retries — context already has user message or tool results.

```typescript
import { agentLoopContinue } from "@tsuuanmi/pi-agent";

const stream = agentLoopContinue(context, config, signal, streamFn);
```

**Important:** The last message in context must convert to a `user` or `toolResult` message via `convertToLlm`. If it doesn't, the LLM provider will reject the request. `agentLoopContinue()` also throws synchronously if the context is empty or if the last context message has role `assistant`; it cannot validate `convertToLlm` output since that runs once per turn.

## Loop Behavior

### Outer and Inner Loops

The agent loop has two nested loops:

1. **Inner loop**: Processes tool calls and steering messages until no more tool calls or steering messages are pending.
2. **Outer loop**: After the inner loop completes, checks for follow-up messages. If any exist, re-enters the inner loop.

### Steering Messages

Steering messages are injected mid-run after tool calls finish:

```typescript
config.getSteeringMessages = async () => steeringQueue.drain();
```

On the first turn of a `prompt()` call, steering is polled once at loop entry (so messages queued while waiting are injected before the first assistant response), then again after the first turn's tool calls finish.

### Follow-Up Messages

Follow-up messages are only checked after the agent would otherwise stop:

```typescript
config.getFollowUpMessages = async () => followUpQueue.drain();
```

### Tool Execution

Tool calls from an assistant message are executed based on `toolExecution` mode:

- **`"parallel"`** (default): Preflight tool calls sequentially, then execute allowed tools concurrently. `tool_execution_end` events fire in completion order after each tool is finalized; tool-result message artifacts are emitted later in assistant source order.
- **`"sequential"`**: Each tool call is prepared, executed, and finalized before the next one starts.

Individual tools can override this with `tool.executionMode = "sequential"`. If any tool call in the message targets a sequential-mode tool, the whole batch runs sequentially.

### Abort Handling

When an `AbortSignal` is provided:
- Tool execution checks the signal before and during execution
- Aborted tool calls return an error tool result with message "Operation aborted"
- Provider aborts are encoded as assistant messages with `stopReason: "aborted"`
- When an assistant message finishes with `stopReason: "error"` or `"aborted"`, the loop emits `turn_end` (with empty tool results) and `agent_end`, then returns without executing tools or polling queues
- Otherwise the loop still emits `agent_end` with the accumulated new messages

### Error Handling

Provider errors are encoded in the stream via protocol events. The loop does not throw for request/model/runtime failures — failures produce an `AssistantMessage` with `stopReason: "error"` and `errorMessage`.

## Events

The loop emits these `AgentEvent` types:

| Event | Description |
|-------|-------------|
| `agent_start` | Loop begins |
| `agent_end` | Loop finishes, includes all new messages |
| `turn_start` | A new assistant turn begins |
| `turn_end` | Turn completes with message and tool results |
| `message_start` | A message enters the context |
| `message_update` | Streaming content delta for assistant messages |
| `message_end` | A message is finalized |
| `tool_execution_start` | Tool call begins executing |
| `tool_execution_update` | Partial tool result update |
| `tool_execution_end` | Tool call finishes |

## Context Transforms

The loop applies transforms in order:

1. **`transformContext`** — Operates on `AgentMessage[]` level (pruning, injection); receives the abort signal.
2. **`convertToLlm`** — Converts `AgentMessage[]` to `Message[]` for the LLM provider.

Both must not throw or reject. Return safe fallback values instead.

## Provider Request Observer

The `providerRequestObserver` config option receives lifecycle events:

| Method | When called |
|--------|-------------|
| `onRequestStart` | Before the LLM call |
| `onRequestPayload` | After payload transformation |
| `onRequestResponse` | After the provider responds |
| `onRequestComplete` | After the response completes (success or error) |

Observer failures are silently ignored and do not affect the loop.

## `prepareNextTurn`

Called after `turn_end` and before the loop decides whether another provider request should start. Return an `AgentLoopTurnUpdate` to replace the context, model, and/or thinking level for the next turn; return `undefined` to keep the current values. `reasoning` is derived from `thinkingLevel` (`undefined` when `"off"`).

## `beforeToolCall` and `afterToolCall`

### `beforeToolCall`

Called after arguments are validated but before execution:

```typescript
beforeToolCall: async (context, signal) => {
  if (isDangerous(context.toolCall.name)) {
    return { block: true, reason: "Dangerous operation blocked" };
  }
  return undefined;
}
```

Return `{ block: true }` to prevent execution. The loop emits an error tool result with `reason` (or a default blocked message) instead. If the abort signal fires during the hook, the loop emits an aborted error tool result.

### `afterToolCall`

Called after a tool finishes executing, before `tool_execution_end` and tool-result message events are emitted:

```typescript
afterToolCall: async (context, signal) => ({
  content: overrideContent,   // Replace content array
  details: overrideDetails,  // Replace details
  isError: false,             // Override error flag
  terminate: false,           // Override early-termination hint
})
```

Omitted fields keep their original values. No deep merge is performed. If the hook itself throws, the loop replaces the result with an error tool result and marks it `isError`.