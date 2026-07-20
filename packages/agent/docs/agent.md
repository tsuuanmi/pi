# Agent

The `Agent` class is a stateful wrapper around the low-level agent loop. It owns the current transcript, emits lifecycle events, executes tools, and exposes queueing APIs for steering and follow-up messages.

## Creating an Agent

```typescript
import { Agent } from "@tsuuanmi/pi-agent";

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful assistant.",
    model: { id: "claude-4-sonnet", name: "Claude 4 Sonnet", api: "anthropic", provider: "anthropic", /* ... */ },
    tools: [/* AgentTool instances */],
  },
  streamFn: streamSimple,
  toolExecution: "parallel",
});
```

### `AgentOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `initialState` | `Partial<AgentState>` | Empty | Initial system prompt, model, tools, messages |
| `convertToLlm` | `(messages) => Message[]` | Filters to user/assistant/toolResult | Convert AgentMessage[] to LLM-compatible Message[] |
| `transformContext` | `(messages, signal?) => Promise<AgentMessage[]>` | — | Transform context before convertToLlm |
| `streamFn` | `StreamFn` | `streamSimple` | Stream function for LLM calls |
| `getApiKey` | `(provider) => string` | — | Dynamic API key resolution |
| `onPayload` | `SimpleStreamOptions["onPayload"]` | — | Payload transform hook |
| `onResponse` | `SimpleStreamOptions["onResponse"]` | — | Response hook |
| `providerRequestObserver` | `ProviderRequestObserver` | — | Observer for LLM request lifecycle |
| `beforeToolCall` | `(context, signal?) => BeforeToolCallResult` | — | Pre-execution hook |
| `afterToolCall` | `(context, signal?) => AfterToolCallResult` | — | Post-execution hook |
| `prepareNextTurn` | `(signal?) => AgentLoopTurnUpdate` | Turn snapshot update hook (signal is the active abort signal) |
| `steeringMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` | How steering messages are drained |
| `followUpMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` | How follow-up messages are drained |
| `sessionId` | `string` | — | Session identifier for cache-aware backends |
| `transport` | `Transport` | `"auto"` | Preferred transport |
| `maxRetryDelayMs` | `number` | — | Cap for provider-requested retry delays |
| `toolExecution` | `"sequential" \| "parallel"` | `"parallel"` | Default tool execution strategy |
| `shouldPause` | `() => boolean` | — | Cooperative pause callback. Checked after each turn; when true the agent stops gracefully. |

## State

```typescript
agent.state.systemPrompt  // System prompt string
agent.state.model         // Current Model
agent.state.thinkingLevel // Current ThinkingLevel
agent.state.tools         // Available tools (assigning copies)
agent.state.messages      // Transcript (assigning copies)
agent.state.isStreaming   // True while processing
agent.state.streamingMessage  // Partial assistant message during streaming
agent.state.pendingToolCalls  // Set of tool call IDs currently executing
agent.state.errorMessage   // Error message from last failed/aborted turn
```

Assigning `state.tools` or `state.messages` copies the top-level array.

## Prompting

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

Listener promises are awaited in subscription order. Listeners receive the active abort signal.

`agent_end` is the final emitted event, but the agent doesn't become idle until all awaited `agent_end` listeners settle.

## Lifecycle Control

```typescript
agent.signal;                // Active abort signal for the current run, or undefined
agent.abort();                // Abort the current run
agent.waitForIdle();          // Promise that resolves after the current run and awaited agent_end listeners settle
agent.reset();                // Clear transcript, runtime state, and queued messages
```

`waitForIdle()` resolves immediately (to a fulfilled promise) when no run is active.

## Queue Modes

| Mode | Behavior |
|------|----------|
| `"one-at-a-time"` | Drain only the oldest queued message per poll |
| `"all"` | Drain all queued messages at once |