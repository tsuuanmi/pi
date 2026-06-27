# Overflow

Context overflow detection and management for LLM conversations.

## `detectOverflow()`

```typescript
import { detectOverflow } from "@tsuuanmi/pi-ai";

const overflow = detectOverflow(messages, contextWindow);
if (overflow) {
  // Messages exceed the context window
}
```

Detects when conversation messages exceed the model's context window capacity.

## Overflow Handling

When overflow is detected, the recommended approach is to compact the conversation (see [Error Handling](../error-handling.md)) or truncate older messages.

## See Also

- [Error Handling](../error-handling.md) - Context overflow patterns
- [Context and Messages](../context.md) - Message types and sizes