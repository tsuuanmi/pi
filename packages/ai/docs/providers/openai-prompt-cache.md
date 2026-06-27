# Prompt Cache

OpenAI prompt caching support for reducing token costs on repeated context.

## Overview

`openai-prompt-cache.ts` implements prompt caching for OpenAI models that support it. When enabled, the provider sends cache control headers that instruct OpenAI to cache portions of the context, reducing costs on subsequent requests.

## Cache Retention

```typescript
type CacheRetention = "lowest" | "low" | "medium" | "high";
```

Cache retention levels map to OpenAI's cache control mechanisms:

| Level | Behavior |
|-------|----------|
| `"lowest"` | Minimal caching |
| `"low"` | Short-duration cache |
| `"medium"` | Medium-duration cache |
| `"high"` | Long-duration cache |

## Usage

```typescript
const result = await streamSimple(model, context, {
  cacheRetention: "high",
});
```

## See Also

- [Models and Providers](../models.md) - Model configuration
- [Streaming](../streaming.md) - Streaming API details