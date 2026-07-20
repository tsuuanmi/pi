# Anthropic Provider

The Anthropic provider implements the Claude Messages API (`api: "anthropic-messages"`) with extended thinking, tool use, prompt caching, and streaming support. It is registered automatically by `register-builtins.ts` and lazy-loaded on first use.

## Usage

```typescript
import { getModel, complete } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-5");
const response = await complete(model, context);
```

The stream function is also exported directly as `streamAnthropic` / `streamSimpleAnthropic` from `@tsuuanmi/pi-ai`.

## Features

- **Extended thinking**: Supports `thinkingLevel` options (`minimal`, `low`, `medium`, `high`, `xhigh`) via `streamSimple`/`completeSimple`, or `thinkingEnabled` + `effort` via `stream`/`complete`. See [Thinking and Reasoning](../reasoning.md).
- **Tool use**: Full tool call and tool result streaming with partial JSON parsing.
- **Caching**: Prompt caching via `cacheRetention` (`"none"` | `"short"` | `"long"`). `"long"` maps to `cache_control.ttl: "1h"` when `supportsLongCacheRetention` is true.
- **Streaming**: Real-time text, thinking, and tool call streaming events.
- **OAuth**: Supports `ANTHROPIC_OAUTH_TOKEN` for OAuth-based authentication (see [OAuth](../utils/oauth.md)).

## Authentication

| Environment Variable | Priority | Description |
|---------------------|----------|-------------|
| `ANTHROPIC_OAUTH_TOKEN` | Highest | OAuth token (takes precedence) |
| `ANTHROPIC_API_KEY` | Fallback | API key authentication |

Keys can also be passed via the `apiKey` option or scoped through the `env` option. See [Browser and Node.js](../browser-usage.md).

## Anthropic-Specific Options

`stream`/`complete` accept `AnthropicOptions` (extends `StreamOptions`):

| Option | Type | Description |
|--------|------|-------------|
| `thinkingEnabled` | `boolean` | Enable extended thinking. Default: omitted (thinking is omitted unless `streamSimple` maps a reasoning level). |
| `effort` | `AnthropicEffort` | `"low"` \| `"medium"` \| `"high"` \| `"xhigh"` \| `"max"`. `"max"` is only valid on Opus 4.6; Opus 4.7+ and Fable 5 use `"xhigh"`. |
| `thinkingDisplay` | `AnthropicThinkingDisplay` | `"summarized"` (default) \| `"omitted"`. When `"omitted"`, thinking blocks return empty text but the encrypted signature still travels for multi-turn continuity. |

## Anthropic Compatibility (`AnthropicMessagesCompat`)

Custom Anthropic-compatible models can set `compat` to override auto-detection:

| Field | Description |
|-------|-------------|
| `supportsLongCacheRetention` | `cache_control.ttl: "1h"` support. Default: `true`. |
| `sendSessionAffinityHeaders` | Send `x-session-affinity` from `options.sessionId`. Default: `false`. |
| `supportsCacheControlOnTools` | `cache_control` on tool definitions. Default: `true`. |
| `supportsTemperature` | Whether the model accepts `temperature`. Claude Opus 4.7+ rejects non-default values. Default: `true`. |
| `allowEmptySignature` | Replay empty thinking signatures as `signature: ""` instead of converting thinking to text. Default: `false`. |

## Model IDs

Common model IDs (see `src/models/generated.ts` for the full list): `claude-opus-4-5`, `claude-opus-4-7`, `claude-haiku-4-5`, `claude-fable-5`, `claude-sonnet-4-5`.

## See Also

- [Adding a New Provider](adding-provider.md) - Step-by-step guide
- [API Registry](api-registry.md) - Provider registration and lazy loading
- [Faux Provider](faux-provider.md) - Test doubles
- [Thinking and Reasoning](../reasoning.md) - Reasoning level mapping
