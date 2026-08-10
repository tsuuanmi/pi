# Authentication

Credential storage, account management, and OAuth flows for LLM providers.

## Overview

Pi supports two authentication methods for LLM providers: API keys and OAuth tokens. Credentials are stored in `~/.pi/agent/auth.json` with file locking to prevent race conditions when multiple Pi instances run concurrently.

Credential files use strict permissions: directories are `0700` and files are `0600` on POSIX. Malformed JSON, unknown fields, invalid references, and insecure permissions throw rather than fail open.

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

The `env` field stores provider-specific environment variables that are set when the key is resolved. Environment variable names must match `^[A-Za-z_][A-Za-z0-9_]*$`.

API key resolution fails closed: if a command (`!`-prefixed) exits non-zero, produces empty output, or a referenced environment variable is unset, `getApiKey` throws rather than returning `undefined`.

### 2. OAuth Authentication

Subscription providers (Anthropic, OpenAI Codex) use OAuth flows:

```bash
pi auth login    # Start OAuth flow
pi auth status   # Check authentication status
pi auth logout   # Clear tokens
```

OAuth credentials are stored with refresh tokens and expiry times. Pi automatically refreshes expired tokens using file locking to prevent race conditions. The `/account` selector shows best-effort OpenAI Codex quota, reset timing when reported, and reset credits for each stored Codex account.

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
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;       // Optional, written by the Codex OAuth provider
};

type AuthCredential = ApiKeyCredential | OAuthCredential | BrowserCredential;
```

### Account Collections

Providers can have multiple accounts with a required active selection:

```typescript
type AuthAccountCollection = {
  active: string;                            // Active account name (required)
  accounts: Record<string, AuthCredential>; // Named accounts
};
```

The `active` field must reference an existing account. Account and provider names must be non-empty, trimmed, and free of path separators or prototype-inherited keys.

### Key Resolution Priority

`getApiKey(providerId)` resolves API keys in order. Pass `accountName` to resolve a specific stored account instead of the active account.

1. **Runtime override** — Set via `setRuntimeApiKey()`, not persisted to disk
2. **API key from auth.json** — Resolved with `resolveConfigValueOrThrow()` for interpolation
3. **OAuth token from auth.json** — Auto-refreshed with file locking

Custom provider keys from `settings.json` are resolved directly by the model registry, not via a fallback resolver on `AuthStorage`.

### Auth Status

`getAuthStatus(provider)` returns status without exposing credential values:

```typescript
type AuthStatus = {
  configured: boolean;
  source?: "stored" | "runtime" | "environment" | "settings_json_key" | "settings_json_command";
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

Auth files are created with mode `0600` (owner read/write only). Parent directories are created with mode `0700`. Existing files with insecure permissions are rejected on read and write.

## API Reference

### AuthStorage Methods

| Method | Description |
|--------|-------------|
| `get(provider)` | Get the active credential for a provider (returns a copy) |
| `set(provider, credential, accountName?)` | Store a credential |
| `remove(provider)` | Remove all credentials for a provider (throws if none stored) |
| `removeAccount(provider, accountName)` | Remove a named account (throws if active and others remain) |
| `has(provider)` | Check if auth.json has credentials for a provider |
| `hasAuth(provider)` | Check if any auth is configured (including env vars) |
| `getApiKey(providerId)` | Resolve API key with full priority chain |
| `getAuthStatus(provider)` | Get auth status without exposing credentials |
| `getAccountNames(provider)` | List account names for a provider |
| `getActiveAccount(provider)` | Get active account name |
| `switchAccount(provider, name)` | Switch active account (throws if not found) |
| `getAll()` | Get all active credentials (returns copies) |
| `login(providerId, callbacks, accountName?)` | Start OAuth login |
| `logout(provider)` | Remove credentials |
| `setRuntimeApiKey(provider, key)` | Set non-persisted override |
| `removeRuntimeApiKey(provider)` | Remove runtime override (throws if none) |
| `reload()` | Re-read credentials from storage |

### Credential Validation

`AuthStorage` validates all credentials on load and on write via `parseAuth` and `serializeAuth`:

- JSON must be a valid object
- Provider and account names must be non-empty, trimmed, and free of path separators and prototype-inherited keys
- `api_key` credentials: `key` is required and non-empty; `env` keys must be valid environment variable names
- `oauth` credentials: `access`, `refresh`, and `expires` are required and validated
- `browser` credentials: `profileId` must match `^[a-zA-Z0-9_-]{16,128}$` and `tunnelSecret` must be at least 32 characters
- `AuthAccountCollection`: `active` must reference an existing account; `accounts` must contain at least one entry
- Unknown fields are rejected

## See Also

- [Providers](../runtime/models/providers.md) - Provider configuration
- [Settings](../settings/index.md) - Settings reference
- [Security](../app/security.md) - Security model