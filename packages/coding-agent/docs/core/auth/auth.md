# Authentication

OAuth-based authentication for subscription LLM providers.

## Provider Authentication

Pi supports two authentication methods:

### 1. API Key Authentication

Set an environment variable for the provider:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
```

Or configure via `/account add` in interactive mode.

### 2. OAuth Authentication

Subscription providers (Anthropic, OpenAI Codex) use OAuth flows:

```bash
pi auth login    # Start OAuth flow
pi auth status   # Check authentication status
pi auth logout   # Clear tokens
```

## Token Management

- Access tokens are automatically refreshed before expiry
- Tokens are stored securely in the system keychain or encrypted files
- Multiple providers can be authenticated simultaneously

## See Also

- [Providers](../model/providers.md) - Provider configuration
- [Security](../trust/security.md) - Security model