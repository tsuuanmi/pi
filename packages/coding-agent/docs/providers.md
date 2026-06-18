# Providers

Pi supports subscription-based providers via OAuth and API key providers via environment variables or `~/.pi/agent/auth.json`.

## Subscriptions

Use `/login` in interactive mode, then select a provider:

- ChatGPT Plus/Pro (Codex)
- Claude Pro/Max

Use `/logout` to clear credentials. Tokens are stored in `~/.pi/agent/auth.json` and auto-refresh when expired.

### OpenAI Codex

- Requires ChatGPT Plus or Pro subscription
- Officially endorsed by OpenAI: [Codex for OSS](https://developers.openai.com/community/codex-for-oss)

### Claude Pro/Max

Anthropic subscription auth is active for Claude Pro/Max accounts. Third-party harness usage draws from [extra usage](https://claude.ai/settings/usage) and is billed per token, not against Claude plan limits.

## API Keys

Use `/login` in interactive mode and select a provider to store an API key in `auth.json`, or set credentials via environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

| Provider | Environment Variable | `auth.json` key |
|----------|----------------------|------------------|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic` |
| OpenAI | `OPENAI_API_KEY` | `openai` |

OpenAI Codex uses OAuth/subscription login.

## Auth File

Store credentials in `~/.pi/agent/auth.json`:

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "openai": { "type": "api_key", "key": "sk-..." },
}
```

The file is created with `0600` permissions (user read/write only). Auth file credentials take priority over environment variables.

API key credentials can also include provider-scoped environment values. These values are used before process environment variables when resolving the credential key, provider/model headers, and provider configuration such as `PI_CACHE_RETENTION` and `HTTP_PROXY`/`HTTPS_PROXY`.

```json
{
  "custom-provider": {
    "type": "api_key",
    "key": "$CUSTOM_PROVIDER_API_KEY",
    "env": {
      "CUSTOM_PROVIDER_API_KEY": "...",
      "CUSTOM_PROVIDER_ENDPOINT": "https://api.custom-provider.example.com"
    }
  }
}
```

Use this when pi should use different provider settings than the project shell environment.

The `key` field supports command execution, environment interpolation, and literals; see [models.md](./models.md) for the full config value syntax. OAuth credentials are also stored here after `/login` and managed automatically.

## Custom Providers

Custom providers can be added through `models.json`; see [models.md](./models.md) and [custom-provider.md](./custom-provider.md). For providers that need custom API implementations or OAuth flows, create an extension; see [custom-provider.md](./custom-provider.md).

## Resolution Order

When resolving credentials for a provider:

1. CLI `--api-key` flag
2. `auth.json` entry (API key or OAuth token)
3. Environment variable
4. Custom provider keys from `models.json`