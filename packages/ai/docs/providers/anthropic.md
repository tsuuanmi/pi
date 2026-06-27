# Anthropic Provider

The Anthropic provider implements the Claude API with extended thinking, tool use, and streaming support.

## Configuration

```typescript
import { registerApiProvider } from "@tsuuanmi/pi-ai";

registerApiProvider({
  id: "anthropic",
  name: "Anthropic",
  createApi: (config) => new AnthropicApi(config),
});
```

## Features

- **Extended thinking**: Supports `thinkingLevel` options (`minimal`, `low`, `medium`, `high`, `xhigh`)
- **Tool use**: Full tool call and tool result streaming with partial JSON parsing
- **Caching**: Supports prompt caching via `cacheRetention` option
- **Streaming**: Real-time text, thinking, and tool call streaming events
- **OAuth**: Supports `ANTHROPIC_OAUTH_TOKEN` for OAuth-based authentication

## Authentication

| Environment Variable | Priority | Description |
|---------------------|----------|-------------|
| `ANTHROPIC_OAUTH_TOKEN` | Highest | OAuth token (takes precedence) |
| `ANTHROPIC_API_KEY` | Fallback | API key authentication |

## Model IDs

Common model IDs: `claude-4-sonnet`, `claude-4-opus`, `claude-3.5-sonnet`, `claude-3.5-haiku`.

## See Also

- [Adding a New Provider](adding-provider.md) - Step-by-step guide
- [API Registry](api-registry.md) - Provider registration and lazy loading
- [Faux Provider](faux-provider.md) - Test doubles