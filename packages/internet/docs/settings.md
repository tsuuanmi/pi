# settings

Mirrors `src/settings.ts`.

Atomic private package settings. Only one setting is currently exposed: `autoLogin`.

## Types

- `InternetSettingsService` — the service interface (`get`, `setAutoLogin`). This is the type
  exported from `src/index.ts`.
- `InternetSettingsStore` — the concrete file-backed implementation.

## `getInternetSettingsPath`

```ts
getInternetSettingsPath(env: NodeJS.ProcessEnv = process.env): string
```

Resolves the settings path. Defaults to `$PI_AGENT_DIR/internet/settings.json`, falling back to
`~/.pi/agent/internet/settings.json` when `PI_AGENT_DIR` is unset/blank.

## `InternetSettingsStore`

A file-backed store holding `{ version: 1, autoLogin: boolean }` written to
`$PI_AGENT_DIR/internet/settings.json`.

- `get()` — reads and validates the file; returns `{ autoLogin: true }` when the file does not exist.
  Throws on an invalid version or non-boolean `autoLogin`.
- `setAutoLogin(autoLogin)` — writes `{ version: 1, autoLogin }` atomically: creates the directory
  (`0700`), writes a temporary file (`0600`), then renames it into place and re-chmods to `0600`.

Writes are private and atomic (temp-file + rename), consistent with the daemon config and harness
secure-write patterns.
