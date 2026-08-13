# tools/accounts

Mirrors `src/tools/accounts.ts`.

Registers three account tools:

- `internet_accounts` — lists configured accounts (`AccountRegistry.list()`), no parameters. Returns
  the accounts JSON as text and as `details`.
- `internet_account_add` — adds an account (`AccountRegistry.add`). Parameters: required `id` and
  `configDir`, optional `displayName`, `host`, `port`. Emits a message to reload Pi to register the
  new provider.
- `internet_account_set_enabled` — enables/disables an account. Parameters: required `id` and boolean
  `enabled`. Emits a reload-Pi message.

The add/enable descriptions explicitly instruct reloading Pi after changing accounts, because the
registered provider set is established at extension load.
