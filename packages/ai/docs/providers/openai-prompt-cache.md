# Prompt Cache

OpenAI prompt caching support for reducing token costs on repeated context.

## Overview

OpenAI provider modules implement prompt caching for models that support it. When enabled, the provider sends cache control hints that instruct OpenAI to cache portions of the context, reducing costs on subsequent requests.

## Cache Retention

```typescript
type CacheRetention = "none" | "short" | "long";
```

`cacheRetention` is shared across providers and mapped per provider:

| Level | OpenAI Responses | Anthropic Messages |
|-------|------------------|-------------------|
| `"none"` | Caching disabled | Caching disabled |
| `"short"` | Default cache duration | Default `cache_control` (5-minute ephemeral) |
| `"long"` | `prompt_cache_retention: "24h"` (when `supportsLongCacheRetention` is true) | `cache_control.ttl: "1h"` (when `supportsLongCacheRetention` is true) |

The default is `"short"`.

## Usage

```typescript
const result = await streamSimple(model, context, {
  cacheRetention: "long",
});
```

## Session Affinity

Pass `sessionId` to enable cache-aware request routing. OpenAI Responses sends it as the `session_id` cache-affinity header (when `sendSessionIdHeader` is true); Anthropic sends it as `x-session-affinity` (when `sendSessionAffinityHeaders` is true).

## See Also

- [Models and Providers](../models.md) - Model configuration and `compat` settings
- [Streaming](../streaming.md) - Streaming API details
- [Simple Options](simple-options.md) - Shared option reference
