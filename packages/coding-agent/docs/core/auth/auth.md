# Authentication

Credential storage, account management, and OAuth flows for LLM providers.

## Overview

Pi supports two authentication methods for LLM providers: API keys and OAuth tokens. Credentials are stored in `~/.pi/agent/auth.json` with file locking to prevent race conditions when multiple Pi instances run concurrently.

## Authentication Methods

### 1. API Key Authentication

Set an environment variable for the provider:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
```

Or store via `/account add` in interactive mode, which writes to `auth.json`.

API key credentials support environment variable interpolation:

```json
{
  "anthropic": {
    "type": "api_key",
    "key": "${ANTHROPIC_API_KEY}",
    "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
  }
}
```

The `env` field stores provider-specific environment variables that are set when the key is resolved.

### 2. OAuth Authentication

Subscription providers (Anthropic, OpenAI Codex) use OAuth flows:

```bash
pi auth login    # Start OAuth flow
pi auth status   # Check authentication status
pi auth logout   # Clear tokens
```

OAuth credentials are stored with refresh tokens and expiry times. Pi automatically refreshes expired tokens using file locking to prevent race conditions.

## AuthStorage

The `AuthStorage` class manages credentials with a pluggable storage backend:

```typescript
const storage = AuthStorage.create();         // File-backed (auth.json)
const storage = AuthStorage.inMemory(data);    // In-memory (for testing)
const storage = AuthStorage.fromStorage(backend); // Custom backend
```

### Credential Types

```typescript
type ApiKeyCredential = {
  type: "api_key";
  key: string;                    // API key or interpolated reference
  env?: Record<string, string>;   // Provider-scoped environment variables
};

type OAuthCredential = {
  type: "oauth";
} & OAuthCredentials;             // access_token, refresh_token, expires, etc.

type AuthCredential = ApiKeyCredential | OAuthCredential;
```

### Account Collections

Providers can have multiple accounts with an active selection:

```typescript
type AuthAccountCollection = {
  active?: string;                          // Active account name
  accounts: Record<string, AuthCredential>; // Named accounts
};
```

### Key Resolution Priority

`getApiKey(providerId)` resolves API keys in order:

1. **Runtime override** — Set via `setRuntimeApiKey()`, not persisted to disk
2. **API key from auth.json** — Resolved with `resolveConfigValue()` for interpolation
3. **OAuth token from auth.json** — Auto-refreshed with file locking
4. **Environment variable** — Provider-specific env vars (e.g., `ANTHROPIC_API_KEY`)
5. **Fallback resolver** — Custom provider keys from models.json

### Auth Status

`getAuthStatus(provider)` returns status without exposing credential values:

```typescript
type AuthStatus = {
  configured: boolean;
  source?: "stored" | "runtime" | "environment" | "fallback" | "models_json_key" | "models_json_command";
  label?: string;
};
```

## AuthStorageBackend

The storage backend interface provides file locking for concurrent access:

```typescript
type LockResult<T> = {
  result: T;
  next?: string;  // Updated data to write back (undefined = no change)
};

interface AuthStorageBackend {
  withLock<T>(fn: (current: string | undefined) => LockResult<T>): T;
  withLockAsync<T>(fn: (current: string | undefined) => Promise<LockResult<T>>): Promise<T>;
}
```

Two implementations:

| Backend | Use Case |
|---------|----------|
| `FileAuthStorageBackend` | Production: uses `proper-lockfile` for cross-process locking |
| `InMemoryAuthStorageBackend` | Testing: in-memory without file I/O |

### File Locking

`FileAuthStorageBackend` uses file locking to prevent race conditions when multiple Pi instances refresh OAuth tokens simultaneously:

- **Sync path** (`withLock`): Retries up to 10 times with 20ms busy-wait delay
- **Async path** (`withLockAsync`): Retries with exponential backoff (10 retries, 100ms–10s), 30s stale lock detection

Auth files are created with mode `0o600` (owner read/write only). Parent directories are created with mode `0o700`.

## API Reference

### AuthStorage Methods

| Method | Description |
|--------|-------------|
| `get(provider)` | Get the active credential for a provider |
| `set(provider, credential, accountName?)` | Store a credential |
| `remove(provider)` | Remove all credentials for a provider |
| `removeAccount(provider, accountName)` | Remove a named account |
| `has(provider)` | Check if auth.json has credentials for a provider |
| `hasAuth(provider)` | Check if any auth is configured (including env vars) |
| `getApiKey(providerId)` | Resolve API key with full priority chain |
| `getAuthStatus(provider)` | Get auth status without exposing credentials |
| `getAccountNames(provider)` | List account names for a provider |
| `getActiveAccount(provider)` | Get active account name |
| `switchAccount(provider, name)` | Switch active account |
| `getAll()` | Get all active credentials |
| `login(providerId, callbacks, accountName?)` | Start OAuth login |
| `logout(provider)` | Remove credentials |
| `setRuntimeApiKey(provider, key)` | Set non-persisted override |
| `removeRuntimeApiKey(provider)` | Remove runtime override |
| `setFallbackResolver(resolver)` | Set custom provider key resolver |
| `reload()` | Re-read credentials from storage |
| `drainErrors()` | Drain accumulated errors |

## See Also

- [Providers](../model/providers.md) - Provider configuration
- [Settings](../settings/settings.md) - Settings reference
- [Security](../trust/security.md) - Security model