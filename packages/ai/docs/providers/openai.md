# OpenAI Providers

The OpenAI family of providers implements the OpenAI API with multiple backends.

## Provider Variants

| Provider | API | Description |
|----------|-----|-------------|
| `openai-responses` | `openai-responses` | OpenAI Responses API (primary) |
| `openai-completions` | `openai-completions` | OpenAI Chat Completions API |
| `openai-codex-responses` | `openai-codex-responses` | OpenAI Codex Responses API |

## OpenAI Responses API

The primary OpenAI provider using the Responses API:

```typescript
// Models registered automatically via register-builtins
// Available as provider: "openai", api: "openai-responses"
```

### Features

- **Tool use**: Full function calling with streaming
- **Streaming**: Real-time text and tool call streaming
- **Responses format**: Native Responses API format with output items

## OpenAI Completions API

The Chat Completions API variant for compatibility:

```typescript
// Available as provider: "openai", api: "openai-completions"
```

### Features

- **Tool use**: Function calling with streaming
- **Streaming**: Real-time text delta events
- **Completions format**: Standard Chat Completions API format

## OpenAI Codex Responses API

The Codex-specific Responses API variant:

```typescript
// Available as provider: "openai-codex", api: "openai-codex-responses"
```

## Authentication

| Environment Variable | Description |
|---------------------|-------------|
| `OPENAI_API_KEY` | API key authentication |

## Prompt Caching

OpenAI providers support prompt caching via `cacheRetention` options for models that support it.

## See Also

- [Adding a New Provider](adding-provider.md) - Step-by-step guide
- [API Registry](api-registry.md) - Provider registration and lazy loading