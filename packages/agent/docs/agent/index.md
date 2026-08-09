# Agent

The `Agent` class is the single standard Pi agent. It owns persistent prompt history, runs the model/tool loop, supports isolated `run()` calls for task/orchestration bridges, emits lifecycle/status events, executes tools, and exposes queueing APIs for steering and follow-up messages.

See [Agent architecture](../architecture.md) for the package ownership and extension boundary. `@tsuuanmi/pi-agent` defines and invokes the host-neutral `AgentHook` and `AgentEvent` contracts; higher-level packages register hooks, subscribe to events, provide concrete tools, and define their own task, session, or UI lifecycles without replacing the Agent loop.

## Creating an Agent

```typescript
import { Agent } from "@tsuuanmi/pi-agent";

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful assistant.",
    model: { id: "claude-4-sonnet", name: "Claude 4 Sonnet", api: "anthropic", provider: "anthropic", /* ... */ },
    tools: [/* Tool instances */],
  },
  toolExecution: "parallel",
});
```

### `AgentOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"agent"` | Stable name for teams, orchestrators, logs, and tracing |
| `capabilities` | `readonly string[]` | `[]` | Capability labels for scheduling |
| `initialState` | `Partial<AgentState>` | Empty | Initial system prompt, model, tools, messages |
| `convertToLlm` | `(messages) => LlmMessage[]` | Canonical AgentMessage conversion | Convert AgentMessage[] to provider-compatible messages |
| `transformContext` | `(messages, signal?) => Promise<AgentMessage[]>` | — | Transform AgentMessage context before convertToLlm |
| `stream` | `StreamFunction` | `stream` from `@tsuuanmi/pi-ai` | Stream function for LLM calls |
| `getApiKey` | `(provider) => string` | — | Dynamic API key resolution |
| `onPayload` | `StreamOptions["onPayload"]` | — | Payload transform hook |
| `onResponse` | `StreamOptions["onResponse"]` | — | Response hook |
| `providerRequestObserver` | `ProviderRequestObserver` | — | Observer for LLM request lifecycle |
| `now` | `() => number` | `Date.now` | Clock for agent-created timestamps |
| `createRequestId` | `(sequence, startedAt) => string` | Standard `llm_*` ids | Provider request id factory |
| `requestTimeoutMs` | `number` | — | Maximum duration for one provider request |
| `hooks` | `readonly AgentHook[]` | `[]` | Agent lifecycle and execution hooks, applied in registration order |
| `extractStructured` | `(output) => unknown` | — | Optional extraction for structured task/orchestration payloads |
| `steeringMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` | How steering messages are drained |
| `followUpMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` | How follow-up messages are drained |
| `sessionId` | `string` | — | Session identifier for provider/session caching |
| `transport` | `Transport` | `"auto"` | Preferred transport |
| `maxRetryDelayMs` | `number` | — | Cap for provider-requested retry delays |
| `toolExecution` | `"sequential" \| "parallel"` | `"parallel"` | Default tool execution strategy |
| `maxToolConcurrency` | `number` | — | Maximum concurrently executing tools for parallel tool batches |
| `maxToolOutputChars` | `number` | — | Maximum original text characters kept from each tool result |
| `shouldPause` | `() => boolean` | — | Cooperative pause callback. Checked after each turn; when true the agent stops gracefully. |

## State

```typescript
agent.state.systemPrompt  // System prompt string
agent.state.model         // Current Model
agent.state.thinkingLevel // Current ThinkingLevel
agent.getTools()          // Snapshot of the active tools
agent.state.messages      // Transcript (assigning copies)
agent.state.isStreaming   // True while processing
agent.state.streamingMessage  // Partial assistant message during streaming
agent.state.pendingToolCalls  // Set of tool call IDs currently executing
agent.state.errorMessage   // Error message from last failed/aborted turn
```

Use `setTools()` to replace the active tools. `getTools()` returns a copy of the active tool list. Assigning `state.messages` copies the top-level array.

## Hooks

Register typed lifecycle and execution hooks with `registerHook()`. Registration order is execution order. A hook name must be unique for an agent, and registration returns a disposer.

```typescript
const removeHook = agent.registerHook({
  name: "policy",
  beforeToolCall: async (context) => {
    if (context.toolCall.name === "dangerous") {
      return { block: true, reason: "Operation blocked" };
    }
    return undefined;
  },
});

removeHook();
```

`subscribe()` remains the event observation API. Agent hooks are copied into isolated `run()` agents; event subscriptions remain attached to their original agent instance.

## Prompting

### `agent.run()`

Run a fresh, isolated prompt and return an `AgentRunResult` without mutating the persistent transcript. This is the path used by team/orchestration task bridges.

```typescript
const result = await agent.run("Build the task", { signal, metadata: { taskId: "build" } });
```

Task-bridge `run()` calls are single-flight per Agent instance.

### `agent.prompt()`

Start a new prompt from text, a single message, or a batch:

```typescript
// From text
await agent.prompt("What is 2+2?");

// From a message
await agent.prompt({
  role: "user",
  content: [{ type: "text", text: "Hello" }],
  timestamp: Date.now(),
});

// From multiple messages
await agent.prompt([msg1, msg2]);
```

Throws if the agent is already processing. Use `steer()` or `followUp()` to queue messages while running.

### `agent.continue()`

Continue from the current transcript. The last message must be a user or tool-result message.

```typescript
await agent.continue();
```

When the last message is an assistant message, `continue()` first drains queued steering messages; if none are queued, it drains queued follow-up messages. If both queues are empty it throws `Cannot continue from message role: assistant`.

## Execution under `Agent`

`Agent` owns the complete execution loop. It calls the configured provider `stream` function, converts and transforms the context, executes tools, updates the transcript, and emits lifecycle events. The loop is internal; callers use `prompt()`, `continue()`, or `run()` instead of invoking an execution runner directly.

## Internal module boundaries

The public facade remains in `src/agent/index.ts`. Internal responsibilities are split by ownership:

- `options.ts`: construction options.
- `state.ts`: mutable Agent state creation.
- `queue.ts`: steering and follow-up message queues.
- `hook-registry.ts`: hook registration and run-lifecycle dispatch.
- `event-dispatcher.ts`: event subscriptions, state projection, and listener dispatch.
- `text.ts`, `defaults.ts`, and `lifecycle.ts`: Agent-local text extraction, defaults, and signal/run primitives.

These modules are internal implementation details. Integrations use the public `Agent`, `AgentHook`, `AgentEvent`, and `Tool` APIs.

## Message Queuing

### Steering (mid-run injection)

Steering messages are injected after the current assistant turn finishes executing tool calls:

```typescript
agent.steer(message);           // Queue a steering message
agent.steeringMode = "all";     // Drain all at once (default: "one-at-a-time")
agent.clearSteeringQueue();     // Remove all queued steering messages
```

### Follow-up (post-stop injection)

Follow-up messages are processed only after the agent would otherwise stop:

```typescript
agent.followUp(message);        // Queue a follow-up message
agent.followUpMode = "all";     // Drain all at once (default: "one-at-a-time")
agent.clearFollowUpQueue();      // Remove all queued follow-up messages
agent.clearAllQueues();          // Clear both queues
agent.hasQueuedMessages();       // Check if either queue has items
```

## Events

### `agent.subscribe()`

Subscribe to agent lifecycle events:

```typescript
const unsubscribe = agent.subscribe((event, signal) => {
  switch (event.type) {
    case "agent_start":
      console.log("Agent started");
      break;
    case "agent_status":
      console.log("Agent status", event.status, event.trace);
      break;
    case "agent_end":
      console.log("Agent ended", event.messages);
      break;
    case "turn_start":
    case "turn_end":
      console.log("Turn boundary");
      break;
    case "message_start":
    case "message_update":
    case "message_end":
      console.log("Message event:", event.type);
      break;
    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
      console.log("Tool event:", event.toolName);
      break;
  }
});

// Later
unsubscribe();
```

Listener promises are awaited in subscription order. Loop events receive the active run abort signal; out-of-band status events receive a signal scoped to that emission. See [Agent events](../events.md) for subscription scope and listener failure behavior.

`agent_end` is the final emitted event, but the agent doesn't become idle until all awaited `agent_end` listeners settle.

## Lifecycle Control

```typescript
agent.signal;                // Active abort signal for the current run, or undefined
agent.abort();                // Abort the current run
agent.waitForIdle();          // Promise that resolves after the current run and awaited agent_end listeners settle
agent.reset();                // Clear transcript and queued messages
agent.dispose();              // Terminal shutdown: abort current work and wait for active work to settle
```

`dispose()` is terminal and idempotent. After disposal, the agent rejects new prompts, isolated runs, queue mutations, and resets.

`waitForIdle()` resolves immediately (to a fulfilled promise) when no run is active.

## Queue Modes

| Mode | Behavior |
|------|----------|
| `"one-at-a-time"` | Drain only the oldest queued message per poll |
| `"all"` | Drain all queued messages at once |
