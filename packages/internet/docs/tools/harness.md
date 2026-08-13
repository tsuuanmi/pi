# tools/harness

Mirrors `src/tools/harness.ts`.

Registers `internet_harness` — inspects or configures account-scoped local tools through the
ChatGPT Web Full harness. Parameters: optional `account`, a required `action` from
`"status" | "enable" | "disable" | "restart"`, and (for `enable`) `tunnelClientPath`, `tunnelId`,
`runtimeKeyFile`.

- `enable` — requires all three tunnel fields; calls `enableFullHarness`, then restarts the daemon.
- `disable` — calls `disableFullHarness`, then restarts the daemon.
- `restart` — restarts the daemon only.
- `status` — no mutation.

Returns `{ account, mode, connectorSetupRequired }` as text and `details`.
