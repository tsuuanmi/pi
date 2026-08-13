# daemon/harness

Mirrors `src/daemon/harness.ts`.

Account-scoped Full-mode configuration and private runtime-key storage.

## `HarnessConfig`

```ts
type HarnessConfig =
  | { mode: "browser-only" }
  | { mode: "full"; tunnelClientPath: string; tunnelId: string; runtimeKeyFile: string };
```

## Paths and helpers

- `harnessConfigPath(account)` — `<configDir>/harness.json`.
- `readHarnessConfig(account)` — reads and validates the harness config; returns
  `{ mode: "browser-only" }` when the file does not exist. Full-mode config requires all three
  strings non-empty.

## `enableFullHarness`

```ts
enableFullHarness(account, { tunnelClientPath, tunnelId, runtimeKeyFile }): Promise<HarnessConfig>
```

Resolves the tunnel client and source key paths. Requires:

- `tunnelId` matching `^tunnel_[a-f0-9]{32}$`.
- The tunnel client binary to be executable.
- The source key file to be a non-empty file no larger than 64 KiB.

It copies the key to `<configDir>/secrets/tunnel-runtime.key` (`0700` dir, `0600` file), writes the
full harness config atomically, and removes the copied key if the config write fails.

## `disableFullHarness`

Writes `{ mode: "browser-only" }` and removes the runtime key file when the previous mode was full.
