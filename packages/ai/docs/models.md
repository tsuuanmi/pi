# Models and Providers

The model registry provides type-safe model discovery, custom model registration, and cost tracking.

## Model Registry

### `getModel(provider, modelId)`

Returns a fully typed `Model` object. Both provider and model ID are auto-completed in IDEs:

```typescript
import { getModel } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-5");
// model.api, model.provider, model.name, model.contextWindow, etc. all typed
```

### `getModels(provider)`

Returns all models for a provider:

```typescript
import { getModels } from "@tsuuanmi/pi-ai";

const anthropicModels = getModels("anthropic");
for (const model of anthropicModels) {
  console.log(`${model.id}: ${model.name} (${model.contextWindow} tokens)`);
}
```

### `getProviders()`

Returns all available provider names:

```typescript
import { getProviders } from "@tsuuanmi/pi-ai";

console.log(getProviders()); // ['anthropic', 'openai', 'openai-codex']
```

## Model Interface

```typescript
interface Model<TApi extends Api> {
  id: string;
  name: string;
  api: TApi;
  provider: Provider;
  baseUrl: string;
  reasoning: boolean;
  input: "text"[];                    // currently only "text" input is modeled
  cost: {
    input: number;      // $/million tokens
    output: number;     // $/million tokens
    cacheRead: number;  // $/million tokens
    cacheWrite: number; // $/million tokens
  };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  /** Maps pi thinking levels to provider-specific values. Missing keys use
   *  provider defaults; null marks a level as unsupported. */
  thinkingLevelMap?: ThinkingLevelMap;
  /** Compatibility overrides. If unset, auto-detected from baseUrl. The shape
   *  is discriminated by `api`: OpenAICompletionsCompat, OpenAIResponsesCompat,
   *  or AnthropicMessagesCompat. */
  compat?: ...;
}
```

`baseUrl` is required. Built-in models are generated from `models.json` into `src/models/generated.ts` (regenerate with `npm run generate-models`); custom models are constructed by hand.

### Cost Tracking

Usage and cost are automatically tracked in every `AssistantMessage`:

```typescript
const message = await complete(model, context);
console.log(`Input: ${message.usage.input} tokens`);
console.log(`Output: ${message.usage.output} tokens`);
console.log(`Cost: $${message.usage.cost.total.toFixed(6)}`);
```

Cost calculation handles Anthropic's 2x cache write multiplier for long retention:

```typescript
import { calculateCost } from "@tsuuanmi/pi-ai";

const cost = calculateCost(model, message.usage);
```

## Custom Models

Create models for local inference servers or custom endpoints:

```typescript
import { type Model, stream } from "@tsuuanmi/pi-ai";

const localModel: Model<"openai-completions"> = {
  id: "llama-3.1-8b",
  name: "Llama 3.1 8B",
  api: "openai-completions",
  provider: "ollama",
  baseUrl: "http://localhost:11434/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 32000,
};
```

`baseUrl` is required for custom models. Without it, requests cannot be routed.

### Compatibility Settings

The `compat` field is a discriminated union keyed by `api`: `OpenAICompletionsCompat` (for `"openai-completions"`), `OpenAIResponsesCompat` (for `"openai-responses"`), or `AnthropicMessagesCompat` (for `"anthropic-messages"`). When omitted, compatibility is auto-detected from `baseUrl`. Below is `OpenAICompletionsCompat`, the largest of the three.

```typescript
const compat: OpenAICompletionsCompat = {
  supportsStore: false,
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
  supportsUsageInStreaming: true,
  maxTokensField: "max_tokens",
  requiresToolResultName: false,
  requiresAssistantAfterToolResult: false,
  requiresThinkingAsText: false,
  requiresReasoningContentOnAssistantMessages: false,
  thinkingFormat: "openai",
  supportsStrictMode: true,
  cacheControlFormat: "anthropic",
  sendSessionAffinityHeaders: false,
  supportsLongCacheRetention: true,
  supportsPromptCacheKey: true,
};
```

| Field | Description |
|-------|-------------|
| `supportsStore` | Whether the `store` field is supported |
| `supportsDeveloperRole` | `developer` role vs `system` |
| `supportsReasoningEffort` | `reasoning_effort` parameter support |
| `supportsUsageInStreaming` | `stream_options: { include_usage: true }` |
| `maxTokensField` | `max_completion_tokens` vs `max_tokens` |
| `requiresToolResultName` | `name` field required on tool results |
| `requiresAssistantAfterToolResult` | A user message after tool results requires an assistant message in between |
| `requiresThinkingAsText` | Thinking blocks converted to `<thinking>` text |
| `requiresReasoningContentOnAssistantMessages` | Replay assistant messages with empty `reasoning_content` when reasoning is on |
| `thinkingFormat` | `"openai"` (reasoning_effort) or `"string-thinking"` |
| `supportsStrictMode` | `strict` in tool definitions |
| `cacheControlFormat` | `"anthropic"` for Anthropic-style `cache_control` markers |
| `sendSessionAffinityHeaders` | Send session-affinity headers for caching |
| `supportsLongCacheRetention` | Long prompt cache retention (e.g. `prompt_cache_retention: "24h"`) |
| `supportsPromptCacheKey` | Emit `prompt_cache_key` for OpenAI-style prompt caching. Default: `true`; set `false` per-provider to opt out. |

`OpenAIResponsesCompat` exposes a smaller subset (`supportsDeveloperRole`, `sendSessionIdHeader`, `supportsLongCacheRetention`). `AnthropicMessagesCompat` exposes `supportsLongCacheRetention`, `sendSessionAffinityHeaders`, `supportsCacheControlOnTools`, `supportsTemperature`, and `allowEmptySignature`. See `src/types.ts` for the authoritative field list.

### Model Thinking Level Maps

`thinkingLevelMap` maps pi thinking levels (`"off"` plus `"minimal"` | `"low"` | `"medium"` | `"high"` | `"xhigh"`) to provider-specific values. Missing keys use provider defaults. A `null` value marks a level as unsupported. Use it for models with provider-specific reasoning controls:

```typescript
const model: Model<"openai-completions"> = {
  // ...
  thinkingLevelMap: {
    off: null,        // Thinking cannot be disabled explicitly
    minimal: null,    // Unsupported level
    low: null,
    medium: null,
    high: "high",     // Maps to provider-specific value
    xhigh: null,
  },
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
  },
};
```

`getSupportedThinkingLevels()` reads `thinkingLevelMap` to compute the available levels. `clampThinkingLevel()` maps a requested level to the nearest supported one.

## Built-in Providers

| API | Provider | Stream Function |
|-----|----------|----------------|
| `anthropic-messages` | Anthropic | `streamAnthropic()` |
| `openai-completions` | OpenAI, Ollama, vLLM, LiteLLM | `streamOpenAICompletions()` |
| `openai-responses` | OpenAI Responses API | `streamOpenAIResponses()` |
| `openai-codex-responses` | OpenAI Codex | `streamOpenAICodexResponses()` |

Built-in providers are lazy-loaded: the provider module is imported on first use, not at application startup.

## Environment Variables

| Provider | Variable(s) |
|----------|-------------|
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_OAUTH_TOKEN` |
| OpenAI | `OPENAI_API_KEY` |

### `getEnvApiKey(provider, env?)`

```typescript
import { getEnvApiKey } from "@tsuuanmi/pi-ai";

const key = getEnvApiKey("openai"); // checks OPENAI_API_KEY
```

### Provider-Scoped Environment Overrides

Pass `env` in stream options to override environment variables per request:

```typescript
const response = await complete(model, context, {
  env: {
    ANTHROPIC_API_KEY: "per-request-key",
    PI_CACHE_RETENTION: "long",
  },
});
```

Values in `env` take precedence over `process.env` for API key discovery and provider configuration.

## Supported Thinking Levels

```typescript
import { getSupportedThinkingLevels } from "@tsuuanmi/pi-ai";

const levels = getSupportedThinkingLevels(model);
// ["off", "minimal", "low", "medium", "high", "xhigh"] for reasoning models
// ["off"] for non-reasoning models
```
