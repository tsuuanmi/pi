# accounts/registry

Mirrors `src/accounts/registry.ts`.

Account routing metadata and atomic persistence. Accounts are stored in a private registry file and
define the per-account loopback endpoint plus config directory used across the package.

## `getAccountRegistryPath`

```ts
getAccountRegistryPath(env: NodeJS.ProcessEnv = process.env): string
```

Resolves the registry path. Defaults to `$PI_AGENT_DIR/internet/accounts.json`, falling back to
`~/.pi/agent/internet/accounts.json` when `PI_AGENT_DIR` is unset/blank.

## `AccountRegistry`

A file-backed registry holding `{ version: 1, accounts: InternetAccount[] }`.

- `list()` — returns the stored accounts, or the implicit default account when no registry file
  exists. The default is `id: "default"`, display name `ChatGPT Web`, the default loopback host/port,
  and `enabled: true`.
- `get(id?)` — returns the account matching `id`, or the first enabled account when `id` is omitted.
  Throws if no match (or no enabled account) exists.
- `add(input)` — normalizes and appends a new account. Rejects a duplicate id or a duplicate
  host:port endpoint. Persists atomically.
- `setEnabled(id, enabled)` — toggles the `enabled` flag on an existing account and persists.

### Normalization

`normalizeAccount` lowercases/trims the id and validates it against `^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$`.
It resolves the config dir to an absolute path, defaults host to `DEFAULT_DAEMON_HOST`, and port to
`DEFAULT_DAEMON_PORT`. Only the default loopback host is accepted, and the port must be an integer in
`1..65535`. `normalizeAccounts` additionally rejects duplicate ids or endpoints across the set.

### Persistence

Writes are atomic and private: directory created with `0700`, a temporary file written with `0600`,
renamed into place, then re-chmod to `0600`.
