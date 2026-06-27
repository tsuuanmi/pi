# Streaming and Completion

The `@tsuuanmi/pi-ai` package provides four top-level functions for interacting with LLMs:

| Function | Description |
|----------|-------------|
| `stream(model, context, options?)` | Stream events as an `AsyncIterable` |
| `complete(model, context, options?)` | Await a complete `AssistantMessage` |
| `streamSimple(model, context, options?)` | Stream with unified reasoning options |
| `completeSimple(model, context, options?)` | Complete with unified reasoning options |

## `stream()` and `complete()`

`stream()` returns an `AssistantMessageEventStream` that implements `AsyncIterable<AssistantMessageEvent>`. Iterate events with `for await`:

```typescript
import { getModel, stream } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-20250514");
const s = stream(model, context);

for await (const event of s) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "done") {
    console.log(`\nFinished: ${event.reason}`);
  }
}

// Get the final assembled message after streaming
const message = await s.result();
```

`complete()` is a convenience wrapper that collects all events and returns the final `AssistantMessage`:

```typescript
import { getModel, complete } from "@tsuuanmi/pi-ai";

const message = await complete(model, context);
console.log(message.stopReason); // "stop" | "length" | "toolUse" | "error" | "aborted"
```

## `streamSimple()` and `completeSimple()`

These functions accept a `SimpleStreamOptions` object with a unified `reasoning` option instead of provider-specific thinking parameters:

```typescript
import { getModel, streamSimple } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-20250514");
const s = streamSimple(model, context, { reasoning: "high" });
```

The `reasoning` option maps to the appropriate provider-specific parameter:

| Reasoning Level | Anthropic | OpenAI Responses | OpenAI Completions |
|----------------|-----------|-----------------|-------------------|
| `"minimal"` | `thinkingEnabled: true, effort: "low"` | `reasoningEffort: "low"` | Omitted |
| `"low"` | `thinkingEnabled: true, effort: "low"` | `reasoningEffort: "low"` | Omitted |
| `"medium"` | `thinkingEnabled: true, effort: "medium"` | `reasoningEffort: "medium"` | Omitted |
| `"high"` | `thinkingEnabled: true, effort: "high"` | `reasoningEffort: "high"` | Omitted |
| `"xhigh"` | `thinkingEnabled: true, effort: "xhigh"` | Not supported | Not supported |

Models without reasoning support ignore the `reasoning` option.

## Stream Event Reference

All events emitted during assistant message generation:

| Event | Description | Key Properties |
|-------|-------------|----------------|
| `start` | Stream begins | `partial`: Initial message structure |
| `text_start` | Text block starts | `contentIndex` |
| `text_delta` | Text chunk received | `delta`, `contentIndex` |
| `text_end` | Text block complete | `content`, `contentIndex` |
| `thinking_start` | Thinking block starts | `contentIndex` |
| `thinking_delta` | Thinking chunk received | `delta`, `contentIndex` |
| `thinking_end` | Thinking block complete | `content`, `contentIndex` |
| `toolcall_start` | Tool call begins | `contentIndex` |
| `toolcall_delta` | Tool arguments streaming | `delta`, `partial.content[contentIndex].arguments` |
| `toolcall_end` | Tool call complete | `toolCall`: `{ id, name, arguments }` |
| `done` | Stream complete | `reason`, `message`: Final message |
| `error` | Error occurred | `reason`: `"error"` or `"aborted"`, `error`: partial message |

### Event Ordering

Streaming events for different content blocks are not guaranteed to be contiguous. Providers may emit deltas for text, thinking, and tool calls interleaved. Consumers must use `contentIndex` to associate each delta/end event with its block and must not assume blocks are uninterrupted.

## Stop Reasons

Every `AssistantMessage` includes a `stopReason`:

| Stop Reason | Description |
|-------------|-------------|
| `"stop"` | Normal completion |
| `"length"` | Output hit maximum token limit |
| `"toolUse"` | Model is calling tools |
| `"error"` | An error occurred |
| `"aborted"` | Request cancelled via `AbortSignal` |

`AssistantMessage` may also include `responseId`, a provider-specific upstream response identifier. Do not assume it is always present.

## Abort and Error Recovery

```typescript
import { getModel, stream } from "@tsuuanmi/pi-ai";

const controller = new AbortController();
setTimeout(() => controller.abort(), 2000);

const s = stream(model, context, { signal: controller.signal });

for await (const event of s) {
  if (event.type === "error") {
    console.log(`${event.reason}:`, event.error.errorMessage);
  }
}

const response = await s.result();
if (response.stopReason === "aborted") {
  // Add partial response to context and continue
  context.messages.push(response);
  context.messages.push({ role: "user", content: "Continue", timestamp: Date.now() });
  const continuation = await complete(model, context);
}
```

## Debugging Provider Payloads

Use the `onPayload` callback to inspect the request payload sent to the provider:

```typescript
const response = await complete(model, context, {
  onPayload: (payload) => {
    console.log("Provider payload:", JSON.stringify(payload, null, 2));
  },
});
```

Supported by `stream`, `complete`, `streamSimple`, and `completeSimple`.

## `AssistantMessageEventStream`

The stream class is also exported for direct use:

```typescript
import { AssistantMessageEventStream } from "@tsuuanmi/pi-ai";
```

Key methods:

| Method | Description |
|--------|-------------|
| `push(event)` | Push an event into the stream |
| `end(result?)` | End the stream with an optional final result |
| `result()` | Promise resolving to the final `AssistantMessage` |
| `[Symbol.asyncIterator]()` | Async iterable iteration |

The stream implements back-pressure: if no consumer is waiting, events are queued. If the stream is done, pending consumers receive `done` results immediately.