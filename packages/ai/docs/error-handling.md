# Error Handling

## Aborting Requests

Cancel in-progress requests using an `AbortSignal`:

```typescript
import { getModel, stream } from "@tsuuanmi/pi-ai";

const controller = new AbortController();
setTimeout(() => controller.abort(), 2000);

const s = stream(model, context, { signal: controller.signal });

for await (const event of s) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "error") {
    console.log(`${event.reason === "aborted" ? "Aborted" : "Error"}:`, event.error.errorMessage);
  }
}

const response = await s.result();
if (response.stopReason === "aborted") {
  console.log("Request was aborted");
  console.log("Partial content:", response.content);
  console.log("Tokens used:", response.usage);
}
```

Aborted messages have `stopReason === "aborted"`. They can be added to context for continuation:

```typescript
context.messages.push(abortedResponse);
context.messages.push({ role: "user", content: "Continue", timestamp: Date.now() });
const continuation = await complete(model, context);
```

## Context Overflow Detection

The `isContextOverflow()` utility detects when an error message indicates the input exceeded the model's context window:

```typescript
import { isContextOverflow } from "@tsuuanmi/pi-ai";

if (message.stopReason === "error" && message.errorMessage) {
  if (isContextOverflow(message, model.contextWindow)) {
    console.log("Context window exceeded — need to compact or truncate messages");
  }
}
```

### Detection Patterns

The function checks two cases:

1. **Error-based overflow**: `stopReason === "error"` with a message matching known overflow patterns from Anthropic and OpenAI.
2. **Silent overflow**: `stopReason === "length"` with `output === 0` and input tokens filling ≥ 99% of the context window (server truncated input leaving no room for output).

### Overflow Error Patterns

| Pattern | Provider |
|---------|----------|
| `prompt is too long` | Anthropic |
| `request_too_large` | Anthropic (HTTP 413) |
| `exceeds the context window` | OpenAI |
| `exceeds the model's maximum context length` | OpenAI |

Rate-limiting and service-unavailable messages are excluded even if they contain overflow-like patterns:

| Exclusion Pattern | Reason |
|-------------------|--------|
| `Throttling error:` | Rate limit |
| `Service unavailable:` | Service down |
| `rate limit` | Generic rate limit |
| `too many requests` | HTTP 429 |

### Custom Provider Support

If you add custom models, overflow patterns from those providers may not be detected. You can:

1. Send a request that exceeds the model's context window
2. Check the `errorMessage` in the response
3. Add a regex pattern that matches the error, or check the error yourself before calling `isContextOverflow`

## Error Stream Events

The `error` event is emitted when an error occurs during streaming:

```typescript
for await (const event of stream) {
  if (event.type === "error") {
    // event.reason is "error" or "aborted"
    // event.error is the AssistantMessage with partial content
    console.error(`Error (${event.reason}):`, event.error.errorMessage);
  }
}
```

Properties on the error message:

| Property | Description |
|----------|-------------|
| `error.errorMessage` | Error description |
| `error.content` | Partial content received before the error |
| `error.usage` | Partial token counts and costs |
| `error.stopReason` | `"error"` or `"aborted"` |

## Diagnostics

Messages may include a `diagnostics` array with structured error information:

```typescript
interface AssistantMessageDiagnostic {
  type: string;
  timestamp: number;
  error?: DiagnosticErrorInfo;
  details?: Record<string, unknown>;
}

interface DiagnosticErrorInfo {
  name?: string;
  message: string;
  stack?: string;
  code?: string | number;
}
```

The `diagnostics` field is appended internally by the library when provider errors or unusual conditions are detected. It is not populated on normal successful responses.

## Provider Load Errors

When a lazy-loaded provider module fails to load, the stream emits an error event and ends:

```typescript
// If the Anthropic SDK module fails to load:
// event.type === "error", event.error.errorMessage contains the load error
// event.error.stopReason === "error"
```

This ensures stream consumers always receive a well-formed `AssistantMessage` even when provider code is missing or broken.