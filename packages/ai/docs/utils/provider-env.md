# Provider Environment

Environment variable resolution for API keys and provider configuration.

## `getProviderEnvValue()`

Resolves an environment variable from scoped overrides, then `process.env`, then the Bun sandbox fallback:

```typescript
import { getProviderEnvValue } from "@tsuuanmi/pi-ai";

const apiKey = getProviderEnvValue("ANTHROPIC_API_KEY");
// Or scoped to a request:
const apiKey = getProviderEnvValue("ANTHROPIC_API_KEY", { ANTHROPIC_API_KEY: "per-request-key" });
```

Resolution order:

1. `env` override (the `ProviderEnv` argument)
2. `process.env`
3. Bun sandbox fallback (`/proc/self/environ`, for Bun compiled binaries in Linux sandboxes)

Case sensitivity matches JavaScript's default (env var names are used as-is). Lookup is not case-normalized here; use the canonical uppercase name.

## Per-Request Scoping

Provider-scoping is done via the `env` field on `StreamOptions`, not via special env var names. Values in `env` take precedence over `process.env` for the duration of a single request:

```typescript
const response = await complete(model, context, {
  env: { ANTHROPIC_API_KEY: "per-request-key", HTTPS_PROXY: "http://corp:8080" },
});
```

## `findEnvKeys()`

```typescript
import { findEnvKeys } from "@tsuuanmi/pi-ai";

const keys = findEnvKeys("anthropic");
// Returns the subset of ["ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"] that is set,
// or undefined if none are set.
```

Returns the configured environment variable names that can provide credentials for a provider, in precedence order. For unknown providers, returns `undefined`.

## `getEnvApiKey()`

```typescript
import { getEnvApiKey } from "@tsuuanmi/pi-ai";

const key = getEnvApiKey("openai"); // reads OPENAI_API_KEY
const key = getEnvApiKey("anthropic"); // reads ANTHROPIC_OAUTH_TOKEN first, then ANTHROPIC_API_KEY
```

Returns the first set credential value for a provider, or `undefined` if none is configured. The `stream`/`complete` entrypoints call this automatically when no explicit `apiKey` is passed.

## Built-in Credential Env Vars

| Provider | Variables (in precedence order) |
|----------|----------------------------------|
| `anthropic` | `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |

Other providers have no built-in credential lookup; pass `apiKey` explicitly or extend the registry.

## See Also

- [Models and Providers](../models.md) - Provider configuration
- [Browser and Node.js](../browser-usage.md) - Environment detection and Bun fallback
