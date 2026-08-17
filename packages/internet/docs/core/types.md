# core/types

Mirrors `src/core/types.ts`.

The account model is a discriminated union with provider-specific configuration.

```ts
type InternetProviderId = "openai" | "gemini-web" | "anthropic" | "google";
```

- `OpenAiInternetAccount` owns `configDir` and loopback `host`/`port` for the bundled ChatGPT Web
daemon. Each Pi session is bound to one durable ChatGPT conversation.
- `GeminiWebInternetAccount` owns the same isolated daemon endpoint fields. Its Pi session ID maps
  one-to-one to one native Gemini chat ID.
- `BrowserInternetAccount` is the ChatGPT Web/Gemini Web union used by daemon lifecycle operations.
- `AnthropicInternetAccount` and `GoogleInternetAccount` own `apiKeyEnv`, the environment-variable
  name used by Pi's provider registry. They never contain the credential value.
- `InternetAccount` is the union of those normalized forms.
- `InternetAccountInput` is the corresponding creation union. `provider` is required; the registry
  supplies browser config directory, host, port, display name, and enabled defaults.
- `isBrowserAccount(account)` narrows daemon operations; `isOpenAiAccount` and
  `isGeminiWebAccount` narrow provider-specific behavior.

`InternetSettings` contains the global `autoLogin` flag. `InternetControlAction` is the daemon admin
action union (`drain`, `resume`, `shutdown`, or `cancel-browser-turns`).
