# Faux Provider for Tests

`registerFauxProvider()` registers a temporary in-memory provider for tests and demos. It is opt-in and not part of the built-in provider set.

## Basic Usage

```typescript
import {
  complete,
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
  registerFauxProvider,
  stream,
} from "@tsuuanmi/pi-ai";

const registration = registerFauxProvider({
  tokensPerSecond: 50, // optional, default: unlimited
});

const model = registration.getModel();
const context = {
  messages: [{ role: "user", content: "Summarize package.json and then call echo", timestamp: Date.now() }],
};

// Set scripted responses
registration.setResponses([
  fauxAssistantMessage([
    fauxThinking("Need to inspect package metadata first."),
    fauxToolCall("echo", { text: "package.json" }),
  ], { stopReason: "toolUse" }),
]);

const first = await complete(model, context, {
  sessionId: "session-1",
  cacheRetention: "short",
});
context.messages.push(first);

// Add tool result
context.messages.push({
  role: "toolResult",
  toolCallId: first.content.find((block) => block.type === "toolCall")!.id,
  toolName: "echo",
  content: [{ type: "text", text: "package.json contents here" }],
  isError: false,
  timestamp: Date.now(),
});

// Set next response
registration.setResponses([
  fauxAssistantMessage([
    fauxThinking("Now I can summarize the tool output."),
    fauxText("Here is the summary."),
  ]),
]);

const s = stream(model, context);
for await (const event of s) {
  console.log(event.type);
}
```

## Multi-Model Setup

Register multiple faux models for model-switching tests:

```typescript
const multiModel = registerFauxProvider({
  models: [
    { id: "faux-fast", reasoning: false },
    { id: "faux-thinker", reasoning: true },
  ],
});

const thinker = multiModel.getModel("faux-thinker");
console.log(thinker?.reasoning); // true
```

## Response Builders

| Function | Description |
|----------|-------------|
| `fauxAssistantMessage(contentBlocks, options?)` | Build a complete assistant message with content blocks |
| `fauxText(text)` | Create a text content block |
| `fauxThinking(text)` | Create a thinking content block |
| `fauxToolCall(name, arguments, options?)` | Create a tool call content block; `options.id` sets a fixed call id (default: random) |

Options for `fauxAssistantMessage`:

```typescript
{
  stopReason?: StopReason;   // default: "stop"
  errorMessage?: string;
  responseId?: string;
  timestamp?: number;        // default: Date.now()
}
```

`fauxAssistantMessage` always sets zero-token usage. To return custom usage, provide a `FauxResponseFactory` (a function `(context, options, state, model) => AssistantMessage | Promise<AssistantMessage>`) in the response queue instead — its returned message's `usage` is preserved. `state.callCount` lets factories branch on request number.

## Queue Management

| Method | Description |
|--------|-------------|
| `registration.setResponses(responses)` | Replace the remaining response queue |
| `registration.appendResponses(responses)` | Append responses to the queue |
| `registration.getPendingResponseCount()` | Number of responses remaining |

Responses are consumed in request order. If the queue is empty when a request arrives, the faux provider returns an error message with `errorMessage: "No more faux responses queued"`.

## Lifecycle

```typescript
// Clean up when done
registration.unregister();

// For multi-model providers
multiModel.unregister();
```

Unregistering removes the temporary provider from the global API registry.

## Token Estimation

When `sessionId` is present and `cacheRetention` is not `"none"`, prompt cache reads and writes are simulated automatically. Usage is estimated at roughly 1 token per 4 characters.

When `tokensPerSecond` is set, streamed chunks are paced in real time. Without it, each chunk is emitted on its own microtask (effectively instant).

## Tool Call Streaming

Tool call arguments stream incrementally via `toolcall_delta` chunks, matching real provider behavior. This allows testing UI code that handles partial tool arguments during streaming.
