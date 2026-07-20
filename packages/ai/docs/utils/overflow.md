# Overflow

Context overflow detection for LLM conversations.

## `isContextOverflow()`

```typescript
import { isContextOverflow } from "@tsuuanmi/pi-ai";

if (isContextOverflow(message, model.contextWindow)) {
  // The input exceeded the model's context window
}
```

Detects when an `AssistantMessage` indicates the input exceeded the model's context window. It handles two cases:

1. **Error-based overflow**: `stopReason === "error"` with an `errorMessage` matching known overflow patterns from Anthropic and OpenAI.
2. **Silent overflow**: `stopReason === "length"` with `output === 0` and input tokens (including cache reads) filling at least 99% of the context window — the server truncated oversized input leaving no room for output.

See [Error Handling](../error-handling.md) for the full list of matched and excluded patterns.

## Overflow Handling

When overflow is detected, the recommended approach is to compact the conversation (see [Error Handling](../error-handling.md)) or truncate older messages.

## Custom Providers

If you add custom models, overflow error patterns from those providers may not be detected. Check the `errorMessage` yourself, or extend the pattern list in `src/text/overflow.ts`.

## See Also

- [Error Handling](../error-handling.md) - Context overflow patterns and recovery
- [Context and Messages](../context.md) - Message types and sizes
