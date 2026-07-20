# Simple Options

Shared streaming options for the OpenAI family of providers.

## `SimpleStreamOptions`

`SimpleStreamOptions` extends `StreamOptions` with a unified `reasoning` level. It is shared across `streamSimple()` and `completeSimple()`.

| Option | Type | Description |
|--------|------|-------------|
| `reasoning` | `ThinkingLevel` | Thinking/reasoning level (`"minimal"` \| `"low"` \| `"medium"` \| `"high"` \| `"xhigh"`) |

`StreamOptions` fields inherited by `SimpleStreamOptions`:

| Option | Type | Description |
|--------|------|-------------|
| `temperature` | `number` | Sampling temperature |
| `maxTokens` | `number` | Maximum tokens to generate |
| `signal` | `AbortSignal` | Abort signal to cancel the request |
| `apiKey` | `string` | API key; takes precedence over env resolution |
| `transport` | `Transport` | Preferred transport mode |
| `cacheRetention` | `CacheRetention` | Prompt cache retention preference. Default: `"short"` |
| `sessionId` | `string` | Session ID for cache-aware backends |
| `headers` | `Record<string, string>` | Custom HTTP headers merged over provider defaults |
| `metadata` | `Record<string, unknown>` | Provider-specific metadata (e.g. Anthropic `user_id`) |
| `env` | `ProviderEnv` | Provider-scoped env overrides; takes precedence over `process.env` |
| `onPayload` | `(payload, model) => unknown \| undefined \| Promise<...>` | Inspect or replace the provider payload before sending |
| `onResponse` | `(response, model) => void \| Promise<void>` | Inspect the HTTP response before the body stream is consumed |
| `timeoutMs` | `number` | HTTP request timeout in ms (OpenAI/Anthropic SDKs default to 10 minutes) |
| `websocketConnectTimeoutMs` | `number` | WebSocket connect/open handshake timeout in ms |
| `maxRetries` | `number` | Client-side retry attempts (OpenAI/Anthropic SDKs default to 2) |
| `maxRetryDelayMs` | `number` | Cap on server-requested retry delay. Default: 60000; `0` disables the cap |

## Transport Modes

```typescript
type Transport = "sse" | "websocket" | "websocket-cached" | "auto";
```

- `"auto"` — Let the provider choose
- `"sse"` — Server-Sent Events
- `"websocket"` — WebSocket streaming
- `"websocket-cached"` — WebSocket with session caching (used by Codex Responses)

Providers that do not support a given transport ignore it.

## Cache Retention

```typescript
type CacheRetention = "none" | "short" | "long";
```

Providers map `cacheRetention` to their supported values. For example, Anthropic maps `"long"` to `cache_control.ttl: "1h"` (when `supportsLongCacheRetention` is true) and OpenAI Responses maps it to `prompt_cache_retention: "24h"`. `"none"` disables prompt caching.

## See Also

- [Streaming and Completion](../streaming.md) - High-level streaming API
- [Prompt Cache](openai-prompt-cache.md) - OpenAI prompt caching details
