# accounts/registry

Mirrors `src/accounts/registry.ts`.

Private, atomic routing metadata for browser and API accounts. The authoritative schema is
`{ accounts: InternetAccount[] }`. Registries with additional top-level fields are rejected.

## Path and defaults

`getAccountRegistryPath()` resolves to `$PI_AGENT_DIR/internet/accounts.json`, or
`~/.pi/agent/internet/accounts.json`. When the file is absent, `list()` returns one enabled
`openai` account named `default` at `127.0.0.1:17841`. Browser conversations are durable per Pi
session under provider-private state.

## `AccountRegistry`

- `list()` reads and validates all accounts.
- `listProvider(provider)` returns accounts narrowed to one provider.
- `getBrowser(id?)` returns only a ChatGPT Web or Gemini Web account.
- `getOpenAi(id?)` and `getGeminiWeb(id?)` enforce a concrete browser provider.
- `add(input)` appends an account after validation. Browser accounts receive the first unused
  loopback port from `17841` when no port is supplied.
- `remove(id)` removes routing metadata without deleting private account data.
- `setEnabled(id, enabled)` changes account availability.

IDs match `^[a-z0-9][a-z0-9-]{0,31}$`. Browser config directories are absolute, must bind to
`127.0.0.1`, and use a unique port. Anthropic and Google accounts store only the name of an API-key environment variable; secret
values are never persisted or returned by account tools.

Writes create the parent directory with `0700`, write a `0600` temporary file, atomically rename it,
and reassert `0600` on the final file.
