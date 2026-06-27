# API Registry

The API registry manages provider implementations and enables lazy loading of provider modules.

## Built-in Providers

Four provider APIs are registered at module load time:

| API | Default Provider | Stream Function |
|-----|-----------------|----------------|
| `anthropic-messages` | Anthropic | `streamAnthropic()` |
| `openai-completions` | OpenAI, Ollama, vLLM, LiteLLM | `streamOpenAICompletions()` |
| `openai-responses` | OpenAI | `streamOpenAIResponses()` |
| `openai-codex-responses` | OpenAI Codex | `streamOpenAICodexResponses()` |

### Lazy Loading

Provider modules are loaded on first use, not at import time. Each provider uses a dynamic `import()` that resolves only when a model with that API is first streamed to. If the module fails to load, the stream emits an error event with `stopReason: "error"`.

## Registering a Custom API Provider

Use `registerApiProvider()` to add a custom API implementation:

```typescript
import { registerApiProvider } from "@tsuuanmi/pi-ai";
import type { Api, AssistantMessageEventStream, Context, Model, StreamOptions } from "@tsuuanmi/pi-ai";

interface MyProviderOptions extends StreamOptions {
  customOption?: string;
}

registerApiProvider({
  api: "my-custom-api",
  stream: (model: Model<Api>, context: Context, options?: StreamOptions) => {
    // Return AssistantMessageEventStream
  },
  streamSimple: (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => {
    // Return AssistantMessageEventStream
  },
});
```

After registration, models with `api: "my-custom-api"` will route to your provider.

## Resetting Providers

```typescript
import { resetApiProviders } from "@tsuuanmi/pi-ai";

// Clears all providers and re-registers built-in providers
resetApiProviders();
```

## Type Safety

Models are typed by their API, which keeps provider-specific option types enforced:

```typescript
import { streamAnthropic } from "@tsuuanmi/pi-ai";
import type { AnthropicOptions } from "@tsuuanmi/pi-ai";

const options: AnthropicOptions = {
  thinkingEnabled: true,
  effort: "high",
};

await streamAnthropic(claude, context, options);
```

The generic `stream()` and `complete()` functions accept `StreamOptions` with additional provider fields, but do not enforce provider-specific types at compile time.

## Provider Stream Functions

Each built-in provider exports two stream functions:

| Export | Description |
|--------|-------------|
| `streamAnthropic` | Stream to Anthropic Messages API |
| `streamSimpleAnthropic` | Stream to Anthropic with simple reasoning options |
| `streamOpenAICompletions` | Stream to OpenAI Chat Completions API |
| `streamSimpleOpenAICompletions` | Stream to OpenAI Completions with simple reasoning |
| `streamOpenAIResponses` | Stream to OpenAI Responses API |
| `streamSimpleOpenAIResponses` | Stream to OpenAI Responses with simple reasoning |
| `streamOpenAICodexResponses` | Stream to OpenAI Codex Responses API |
| `streamSimpleOpenAICodexResponses` | Stream to Codex Responses with simple reasoning |

These are lazy wrappers that load the provider module on first call and forward events from the inner stream.

## Session Resource Cleanup

The library registers session resource cleanup handlers for providers that maintain connections (e.g., WebSocket pools):

```typescript
import { registerSessionResourceCleanup, cleanupSessionResources } from "@tsuuanmi/pi-ai";

// Register a cleanup handler
const unregister = registerSessionResourceCleanup((sessionId) => {
  // Close connections, release resources
});

// Remove the handler
unregister();

// Clean up all session resources (e.g., on shutdown)
cleanupSessionResources(sessionId);
```

`cleanupSessionResources()` calls all registered cleanup handlers. If any handler throws, errors are collected into an `AggregateError`.