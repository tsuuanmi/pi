# Browser and Node.js

## Browser Usage

The package can run in browser environments when credentials are supplied by the caller or a backend proxy. Do not expose production provider keys in frontend code.

```typescript
import { complete, getModel } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-haiku-4-5");
const response = await complete(
  model,
  { messages: [{ role: "user", content: "Hello!", timestamp: Date.now() }] },
  { apiKey: "development-key" },
);
```

## Node.js

In Pi, provider credentials come from `auth.json` and are passed to `@tsuuanmi/pi-ai` through `StreamOptions.apiKey`. The AI package does not discover API keys from environment variables.

Provider-scoped `env` values are still available for non-credential settings such as proxy configuration and cache retention:

```typescript
const response = await complete(model, context, {
  apiKey,
  env: {
    PI_CACHE_RETENTION: "long",
    HTTPS_PROXY: "http://localhost:8080",
  },
});
```

## Proxy Configuration

Node.js transports respect standard proxy environment variables, including scoped `env` overrides:

| Variable | Description |
|----------|-------------|
| `HTTP_PROXY` | Proxy for HTTP requests |
| `HTTPS_PROXY` | Proxy for HTTPS requests |
| `NO_PROXY` | Hosts to exclude from proxying |
