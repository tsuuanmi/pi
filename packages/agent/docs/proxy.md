# Proxy Stream

`streamProxy()` routes LLM calls through a server instead of calling providers directly. The server manages authentication and proxies requests to LLM providers.

## Usage

```typescript
import { Agent, streamProxy } from "@tsuuanmi/pi-agent";

const agent = new Agent({
  streamFn: (model, context, options) =>
    streamProxy(model, context, {
      ...options,
      authToken: await getAuthToken(),
      proxyUrl: "https://genai.example.com",
    }),
});
```

## ProxyStreamOptions

| Option | Type | Description |
|--------|------|-------------|
| `authToken` | `string` | Auth token for the proxy server |
| `proxyUrl` | `string` | Proxy server URL (e.g., `"https://genai.example.com"`) |
| `signal` | `AbortSignal` | Local abort signal for the proxy request |
| `temperature` | `number` | Forwarded to provider |
| `maxTokens` | `number` | Forwarded to provider |
| `reasoning` | `ThinkingLevel` | Forwarded to provider |
| `cacheRetention` | `CacheRetention` | Forwarded to provider |
| `sessionId` | `string` | Forwarded to provider |
| `headers` | `Record<string, string>` | Forwarded to provider |
| `metadata` | `Record<string, unknown>` | Forwarded to provider |
| `transport` | `Transport` | Forwarded to provider |
| `maxRetryDelayMs` | `number` | Forwarded to provider |

## How It Works

1. The proxy stream sends a POST request to `{proxyUrl}/api/stream` with the model, context, and serializable options.
2. The server strips the `partial` field from delta events to reduce bandwidth.
3. The client reconstructs the partial message locally from received events.
4. Events are decoded from SSE (`data: ...` lines) and converted to `AssistantMessageEvent`.

## Proxy Event Types

The proxy server sends events with partial fields stripped:

| Event | Fields |
|-------|--------|
| `start` | — |
| `text_start` | `contentIndex` |
| `text_delta` | `contentIndex`, `delta` |
| `text_end` | `contentIndex`, `contentSignature?` |
| `thinking_start` | `contentIndex` |
| `thinking_delta` | `contentIndex`, `delta` |
| `thinking_end` | `contentIndex`, `contentSignature?` |
| `toolcall_start` | `contentIndex`, `id`, `toolName` |
| `toolcall_delta` | `contentIndex`, `delta` |
| `toolcall_end` | `contentIndex` |
| `done` | `reason`, `usage` |
| `error` | `reason`, `errorMessage?`, `usage` |

## Error Handling

- HTTP errors from the proxy produce an error event with `stopReason: "error"`.
- Aborted requests (via `AbortSignal`) produce an error event with `stopReason: "aborted"`.
- The proxy stream never throws — all failures are encoded in the stream.