# core/types

Mirrors `src/core/types.ts`.

The account model is a discriminated union with provider-specific configuration.

```ts
type InternetProviderId = "openai" | "anthropic" | "google";
type InternetConversationMode = "temporary" | "durable";
```

- `OpenAiInternetAccount` owns `configDir`, loopback `host`/`port`, and `conversationMode` for the
  bundled ChatGPT Web daemon.
- `AnthropicInternetAccount` and `GoogleInternetAccount` own `apiKeyEnv`, the environment-variable
  name used by Pi's provider registry. They never contain the credential value.
- `InternetAccount` is the union of those normalized forms.
- `InternetAccountInput` is the corresponding creation union. `provider` is required; the registry
  supplies browser config directory, host, port, display name, and enabled defaults.
- `isOpenAiAccount(account)` narrows daemon-only operations at their dependency boundary.

`InternetSettings` contains the global `autoLogin` flag. `InternetControlAction` is the daemon admin
action union (`drain`, `resume`, `shutdown`, or `cancel-browser-turns`).
