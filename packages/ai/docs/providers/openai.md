# OpenAI Providers

The OpenAI family of providers implements the OpenAI API with multiple backends.

## Provider Variants

| API | Stream Function | Description |
|----------|-----|-------------|
| `openai-responses` | `streamOpenAIResponses` | OpenAI Responses API (primary) |
| `openai-completions` | `streamOpenAICompletions` | OpenAI Chat Completions API |
| `openai-codex-responses` | `streamOpenAICodexResponses` | OpenAI Codex Responses API |

All three are registered automatically by `register-builtins.ts` and lazy-loaded on first use. They are also exported directly from `@tsuuanmi/pi-ai`.

## OpenAI Responses API

The primary OpenAI provider using the Responses API. Available as `provider: "openai"`, `api: "openai-responses"`.

### Features

- **Tool use**: Full function calling with streaming
- **Streaming**: Real-time text and tool call streaming
- **Responses format**: Native Responses API format with output items
- **Prompt caching**: `cacheRetention: "long"` maps to `prompt_cache_retention: "24h"` (when `supportsLongCacheRetention` is true); `sessionId` is sent as the `session_id` cache-affinity header (when `sendSessionIdHeader` is true).

### Options

`streamOpenAIResponses` accepts `OpenAIResponsesOptions` (extends `StreamOptions`):

| Option | Description |
|--------|-------------|
| `reasoningEffort` | Reasoning effort passed straight through (set by `streamSimple` from the clamped `reasoning` level) |
| `reasoningSummary` | OpenAI Responses API reasoning summary mode |
| `serviceTier` | OpenAI service tier (see `OpenAIServiceTier`) |

## OpenAI Completions API

The Chat Completions API variant for OpenAI-compatible servers. Available as `provider: "openai"` (or `ollama`, `vLLM`, `LiteLLM`, etc.), `api: "openai-completions"`.

### Features

- **Tool use**: Function calling with streaming
- **Streaming**: Real-time text delta events
- **Completions format**: Standard Chat Completions API format

### Options

`streamOpenAICompletions` accepts `OpenAICompletionsOptions` (extends `StreamOptions`):

| Option | Description |
|--------|-------------|
| `reasoningEffort` | Reasoning effort passed straight through |
| `toolChoice` | Tool choice override |

Provider compatibility is tuned via `OpenAICompletionsCompat` on the model (see [Models and Providers](../models.md)). When `compat` is unset, fields are auto-detected from `baseUrl`.

## OpenAI Codex Responses API

The Codex-specific Responses API variant, available as `provider: "openai-codex"`, `api: "openai-codex-responses"`. It uses WebSocket transports (`"websocket"` / `"websocket-cached"`) and supports OAuth-based authentication.

### Codex Usage Summary

`@tsuuanmi/pi-ai/openai-codex-usage` exports helpers for retrieving ChatGPT plan usage:

```typescript
import {
  fetchOpenAICodexUsageSummary,
  getOpenAICodexUsageCacheTtlMs,
  type OpenAICodexRequestAuth,
  type OpenAICodexUsageAuthProvider,
  type OpenAICodexUsageStatus,
  type OpenAICodexUsageSummary,
} from "@tsuuanmi/pi-ai/openai-codex-usage";
```

`fetchOpenAICodexUsageSummary(model, authProvider)` returns a `{ text, status }` summary where `status` is `"ok" | "warning" | "exhausted" | "unknown"`. Results are cached for the TTL returned by `getOpenAICodexUsageCacheTtlMs()` (default 60s).

## Authentication

| Environment Variable | Description |
|---------------------|-------------|
| `OPENAI_API_KEY` | API key authentication |
| OAuth (Codex) | Via `@tsuuanmi/pi-ai/oauth` `loginOpenAICodex()` (see [OAuth](../utils/oauth.md)) |

## Prompt Caching

OpenAI providers support prompt caching via `cacheRetention` (`"none"` | `"short"` | `"long"`) for models that support it. See [Prompt Cache](openai-prompt-cache.md).

## See Also

- [Adding a New Provider](adding-provider.md) - Step-by-step guide
- [API Registry](api-registry.md) - Provider registration and lazy loading
- [Prompt Cache](openai-prompt-cache.md) - `cacheRetention` details
- [Simple Options](simple-options.md) - Shared option reference
