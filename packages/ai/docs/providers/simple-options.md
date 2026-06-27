# Simple Options

Shared streaming options for the OpenAI family of providers.

## `SimpleStreamOptions`

Options shared across `streamSimple()` and `completeSimple()`:

| Option | Type | Description |
|--------|------|-------------|
| `temperature` | `number` | Sampling temperature |
| `maxTokens` | `number` | Maximum tokens to generate |
| `reasoning` | `ThinkingLevel` | Thinking/reasoning level |
| `cacheRetention` | `CacheRetention` | Prompt cache retention |
| `sessionId` | `string` | Session ID for cache-aware backends |
| `headers` | `Record<string, string>` | Additional HTTP headers |
| `metadata` | `Record<string, unknown>` | Provider-specific metadata |
| `transport` | `Transport` | Transport mode (`"auto"`, `"sse"`, `"websocket"`) |
| `maxRetryDelayMs` | `number` | Maximum retry delay |

## Transport Modes

```typescript
type Transport = "auto" | "sse" | "websocket";
```

- `"auto"` — Let the provider choose
- `"sse"` — Server-Sent Events
- `"websocket"` — WebSocket streaming