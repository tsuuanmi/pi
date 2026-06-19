# Providers

Pi supports subscription-based providers via OAuth and API key providers via environment variables or `~/.pi/agent/auth.json`.

## Subscriptions

Use `/account add` in interactive mode, then select a provider:

- ChatGPT Plus/Pro (Codex)
- Claude Pro/Max

Use `/account remove` to clear credentials. Tokens are stored in `~/.pi/agent/auth.json` and auto-refresh when expired.

To store multiple accounts for one provider, pass an account name:

```text
/account add openai-codex main
/account add openai-codex backup
/account openai-codex backup
```

`/account` opens an account selector with provider, provider ID, account name, and active status. `/account <provider>` opens the same selector filtered to one provider. `/account <provider> <account>` switches directly without opening the selector. `/account remove <provider> <account>` removes one named account. `/account remove <provider>` removes all stored credentials for that provider.

### OpenAI Codex

- Requires ChatGPT Plus or Pro subscription
- Officially endorsed by OpenAI: [Codex for OSS](https://developers.openai.com/community/codex-for-oss)

### Claude Pro/Max

Anthropic subscription auth is active for Claude Pro/Max accounts. Third-party harness usage draws from [extra usage](https://claude.ai/settings/usage) and is billed per token, not against Claude plan limits.

## API Keys

Use `/account add` in interactive mode and select a provider to store an API key in `auth.json`, `/account add <provider> <account>` to store a named account, or set credentials via environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

| Provider | Environment Variable | `auth.json` key |
|----------|----------------------|------------------|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic` |
| OpenAI | `OPENAI_API_KEY` | `openai` |

OpenAI Codex uses OAuth/subscription accounts.

## Auth File

Store credentials in `~/.pi/agent/auth.json`:

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "openai": { "type": "api_key", "key": "sk-..." }
}
```

Named accounts use an `accounts` object and an `active` account pointer:

```json
{
  "openai-codex": {
    "active": "backup",
    "accounts": {
      "main": { "type": "oauth", "refresh": "...", "access": "...", "expires": 1790000000000 },
      "backup": { "type": "oauth", "refresh": "...", "access": "...", "expires": 1790000000000 }
    }
  }
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

The `key` field supports command execution, environment interpolation, and literals; see [models.md](./models.md) for the full config value syntax. OAuth credentials are also stored here after `/account add` and managed automatically.

When a custom provider also has `apiKey` in `models.json`, `auth.json` wins. The `models.json` key is only a fallback when there is no active stored account or environment key.

## Custom Providers

Custom providers can be added with `/provider add` or through `models.json`; see [models.md](./models.md) and [custom-provider.md](./custom-provider.md). For providers that need custom API implementations or OAuth flows, create an extension; see [custom-provider.md](./custom-provider.md).

## Resolution Order

When resolving credentials for a provider:

1. CLI `--api-key` flag
2. `auth.json` entry (API key or OAuth token)
3. Environment variable
4. Custom provider keys from `models.json`