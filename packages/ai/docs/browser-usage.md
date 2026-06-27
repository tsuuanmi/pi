# Browser and Node.js

## Browser Usage

The library supports browser environments. Pass the API key explicitly since `process.env` is unavailable:

```typescript
import { getModel, complete } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-3-5-haiku-20241022");

const response = await complete(model, {
  messages: [{ role: "user", content: "Hello!" }],
}, {
  apiKey: "your-api-key",
});
```

> **Security Warning**: Exposing API keys in frontend code is dangerous. Anyone can extract and abuse your keys. Only use this approach for internal tools or demos. For production applications, use a backend proxy.

### Browser Compatibility Notes

- OAuth login flows are not supported in browser environments
- Use `@tsuuanmi/pi-ai/oauth` only in Node.js environments
- The `getEnvApiKey()` function returns `undefined` in browsers (no `process.env`)
- WebSocket and SSE transports work in browsers for proxy backends

## Node.js Environment Variables

In Node.js, API keys are resolved from environment variables automatically:

| Provider | Variable(s) |
|----------|-------------|
| Anthropic | `ANTHROPIC_API_KEY` or `ANTHROPIC_OAUTH_TOKEN` |
| OpenAI | `OPENAI_API_KEY` |

Resolution priority:

1. Explicit `apiKey` in `StreamOptions`
2. Scoped `env` overrides in `StreamOptions`
3. `process.env`
4. Bun sandbox fallback (`/proc/self/environ`)

```typescript
// Uses OPENAI_API_KEY from process.env
const model = getModel("openai", "gpt-4o-mini");
const response = await complete(model, context);

// Override with explicit key
const response2 = await complete(model, context, {
  apiKey: "sk-different-key",
});
```

## Provider-Scoped Environment Overrides

Pass `env` in stream options to scope provider configuration to a single request:

```typescript
const response = await complete(model, context, {
  env: {
    ANTHROPIC_API_KEY: "per-request-key",
    PI_CACHE_RETENTION: "long",
  },
});
```

Values in `env` take precedence over `process.env` for API key discovery and provider configuration. Use this when one process needs different provider settings per request.

## Bun Sandbox Fallback

When running inside a Bun compiled binary on Linux, `process.env` may be empty inside sandboxed environments. The library automatically falls back to reading `/proc/self/environ` in this case. This fallback is implemented in `getProviderEnvValue()` and is transparent to callers.

If you use `@tsuuanmi/pi-ai` directly (not through the coding agent), this fallback ensures provider environment variables are still resolved correctly inside Bun sandboxes.

## Checking Environment Variables

```typescript
import { getEnvApiKey, findEnvKeys } from "@tsuuanmi/pi-ai";

// Check if an API key is configured
const key = getEnvApiKey("openai"); // checks OPENAI_API_KEY

// Find which environment variables are set for a provider
const keys = findEnvKeys("anthropic"); // ["ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"] or subset
```

## Proxy Configuration

In Node.js environments, the library respects standard proxy environment variables:

| Variable | Description |
|----------|-------------|
| `HTTP_PROXY` | Proxy for HTTP requests |
| `HTTPS_PROXY` | Proxy for HTTPS requests |
| `NO_PROXY` | Hosts to exclude from proxying |

These can also be passed via scoped `env` overrides in `StreamOptions`.