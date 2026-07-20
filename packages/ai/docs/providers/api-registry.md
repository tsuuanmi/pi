# API Registry

The API registry manages provider implementations and enables lazy loading of provider modules.

## Built-in Providers

Four provider APIs are registered at module load time:

| API | Stream Function | Common Providers |
|-----|-----------------|-----------------|
| `anthropic-messages` | `streamAnthropic()` | Anthropic |
| `openai-completions` | `streamOpenAICompletions()` | OpenAI, plus OpenAI-compatible servers (Ollama, vLLM, LiteLLM) |
| `openai-responses` | `streamOpenAIResponses()` | OpenAI |
| `openai-codex-responses` | `streamOpenAICodexResponses()` | OpenAI Codex |

The registry is keyed by `api`. Multiple `provider` values can share one API (e.g. `openai`, `ollama`, `vllm` all use `openai-completions`).

### Lazy Loading

Provider modules are loaded on first use, not at import time. Each provider uses a dynamic `import()` that resolves only when a model with that API is first streamed to. If the module fails to load, the stream emits an error event with `stopReason: "error"`.

## Registering a Custom API Provider

Use `registerApiProvider()` to add a custom API implementation. Both `stream` and `streamSimple` are required:

```typescript
import { registerApiProvider } from "@tsuuanmi/pi-ai";
import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
  StreamOptions,
} from "@tsuuanmi/pi-ai";

interface MyProviderOptions extends StreamOptions {
  customOption?: string;
}

registerApiProvider({
  api: "my-custom-api",
  stream: (model: Model<Api>, context: Context, options?: MyProviderOptions): AssistantMessageEventStream => {
    // Return AssistantMessageEventStream
  },
  streamSimple: (model: Model<Api>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream => {
    // Return AssistantMessageEventStream
  },
});
```

An optional `sourceId` lets you later remove only the providers you registered via `unregisterApiProviders(sourceId)`.

After registration, models with `api: "my-custom-api"` will route to your provider.

## Resetting and Clearing Providers

```typescript
import { resetApiProviders, clearApiProviders, unregisterApiProviders } from "@tsuuanmi/pi-ai";

// Clear all providers and re-register the built-in providers
resetApiProviders();

// Clear all providers without re-registering built-ins
clearApiProviders();

// Remove only providers registered with a given sourceId
unregisterApiProviders("my-extension");
```

## Type Safety

Models are typed by their API, which keeps provider-specific option types enforced when you call the per-provider stream function directly:

```typescript
import { getModel, streamAnthropic } from "@tsuuanmi/pi-ai";
import type { AnthropicOptions } from "@tsuuanmi/pi-ai";

const claude = getModel("anthropic", "claude-sonnet-4-5");

const options: AnthropicOptions = {
  thinkingEnabled: true,
  effort: "high",
};

await streamAnthropic(claude, context, options).result();
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
