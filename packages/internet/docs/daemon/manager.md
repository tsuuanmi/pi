# daemon/manager

Mirrors `src/daemon/manager.ts`.

The single owner of the daemon/tunnel lifecycle. It tracks per-account child processes, serializes
operations per account, and exposes login/start/stop/restart/status/auto-start.

## Types

- `DaemonProcessState` — `"stopped" | "running" | "login-required"`.
- `OwnedDaemonStatus` — `{ account, state, pid?, loginExists, owned }`.
- `OwnedDaemonManagerOptions` — injectable `runtime`, `resolveRuntime`, `spawn`, and `waitForHealth`
  (used by tests).

## `OwnedDaemonManager`

Constructor takes the account list and optional overrides. It builds an id→account map and defaults
runtime resolution to `resolveDaemonRuntime` and process spawn to Node `spawn`.

### Lifecycle

- `autoStart()` — starts every enabled account that already has verified login.
- `ensureReady(accountId)` — guarantees login (when needed) and a healthy daemon; used by the
  `before_provider_request` hook.
- `login(accountId)` — stops any running daemon, writes the owned config, and runs the bundled
  launcher `login` interactively (`stdio: inherit`). Verifies the login marker afterward and syncs
  capabilities.
- `start(accountId)` — spawns the launcher `serve` child. If a healthy daemon with a matching config
  fingerprint is already running, returns without spawning. If a stale daemon runs with a different
  fingerprint, it issues `shutdown` and waits for offline first. On successful health it connects the
  tunnel in full mode. Failures kill the child and rethrow.
- `stop(accountId?)` — with an id stops that account; otherwise stops all. Sends admin `shutdown`,
  falls back to `SIGTERM`, then `SIGKILL` after a 5s grace.
- `restart(accountId)` — stop then start.
- `status(accountId?)` — returns per-account status, reporting `running` when the tracked child is
  alive or a healthy daemon is reachable; otherwise `login-required` when no login exists, else
  `stopped`.

### Concurrency

`enqueue(accountId, op)` serializes operations per account: each new operation is chained after the
previous one, and a completed entry is removed from the map. This prevents overlapping
login/start/stop calls for the same account.

### Process tracking

Each spawned child is stored in `processes` (keyed by account id), marked `managed`, and unref'd.
On exit the map and managed set are cleaned up for that account. `waitForOffline` polls health up to
50 times (100ms apart) to confirm a shutdown completed before a restart.
