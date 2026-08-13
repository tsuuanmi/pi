# daemon/config

Mirrors `src/daemon/config.ts`.

Package-owned daemon/browser configuration, login markers, capabilities, and secure atomic writes.
This is the config the package writes for the bundled daemon; it is distinct from the daemon's own
`config.json` read by [`backends/openai/daemon/auth.md`](../backends/openai/daemon/auth.md).

## Constants

- `CONFIG_VERSION` — `3`.
- `APP_NAME` — `"Codex Native2"`.
- `BROWSER_IDLE_SHUTDOWN_MS` — `5 * 60 * 1000`.
- `BROWSER_WINDOW_WIDTH` / `BROWSER_WINDOW_HEIGHT` — `900` / `700`.

## `OwnedDaemonConfig`

The full owned config: version, release version, `mode` (`"browser-only"` or `"full"`), loopback
host, the account's `port`, context window (`256_000`), app name, `managed-chrome` browser host,
Chrome executable path, storage-state path, broker socket path, headed window, idle shutdown, the
`solAvailable`/`proAvailable` capability flags, `autoApproveToolCalls: false`, control token, runtime
command, acknowledgement timestamp, and (in full mode) tunnel settings.

## Capabilities

- `DaemonCapabilities` — `{ solAvailable, proAvailable }`.
- `readOwnedDaemonCapabilities(account)` — parses and validates the owned config and returns its
  capability flags. Missing config (ENOENT) falls back to `{ solAvailable: true, proAvailable: false }`.
- `syncOwnedDaemonCapabilities(account)` — reads the login marker's `solAvailable`/`proAvailable` and
  rewrites the owned config when they differ.

## Paths

- `daemonConfigPath(account)` — `<configDir>/config.json`.
- `daemonLoginMarkerPath(account)` — `<configDir>/browser/storage-state.json.verified.json`.

## `daemonLoginExists`

```ts
daemonLoginExists(account): Promise<boolean>
```

True when both the browser storage-state file exists and the login marker is valid
(`version === 1`, `authenticated === true`, and a string `verifiedAt`).

## `daemonConfigFingerprint`

```ts
daemonConfigFingerprint(config): string
```

Sha256 hex of the JSON-serialized config.

## `ensureOwnedDaemonConfig`

```ts
ensureOwnedDaemonConfig(account, options?): Promise<OwnedDaemonConfig>
```

Reads the harness config and reuses an existing valid config if it still matches the harness mode
and window/idle values. Otherwise it writes (atomically, `0700` dir / `0600` file) a new config
derived from the account, harness, and options. Requires a `runtimeCommand` and `releaseVersion` for
a fresh write. Chrome defaults to `/usr/bin/google-chrome`. In full mode it embeds the tunnel
client path, tunnel id, runtime-key file, and a `pi-internet-<account.id>` profile/alias.

`validateOwnedConfig` enforces the version, mode, loopback endpoint matching the account, and a
control token matching `^[A-Za-z0-9_-]{40,}$`.

`writePrivateJson` writes via temp file + rename and verifies the final permissions are exactly
`0600`.
