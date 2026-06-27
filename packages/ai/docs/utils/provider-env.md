# Provider Environment

Provider-scoped environment variable resolution for API keys and configuration.

## `getProviderEnvValue()`

```typescript
import { getProviderEnvValue } from "@tsuuanmi/pi-ai";

// Reads provider-scoped env vars first, then falls back to global
const apiKey = getProviderEnvValue("API_KEY", { provider: "anthropic", providerEnv: process.env });
```

## Provider-Scoped Variables

Environment variables can be scoped to specific providers:

| Global Variable | Provider-Scoped Variable | Description |
|----------------|--------------------------|-------------|
| `OPENAI_API_KEY` | `OPENAI_OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | `ANTHROPIC_ANTHROPIC_API_KEY` | Anthropic API key |

Provider-scoped variables take precedence over global variables.

## `findEnvKeys()`

```typescript
import { findEnvKeys } from "@tsuuanmi/pi-ai";

const keys = findEnvKeys("anthropic");
// Returns: ["ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"]
```

Finds configured environment variable names for a provider.

## `getEnvApiKey()`

```typescript
import { getEnvApiKey } from "@tsuuanmi/pi-ai";

const key = getEnvApiKey("openai");
// Reads from OPENAI_API_KEY or OPENAI_OPENAI_API_KEY
```

Gets the API key value for a provider from environment variables.

## See Also

- [Models and Providers](../models.md) - Provider configuration
- [Browser and Node.js](../browser-usage.md) - Environment detection