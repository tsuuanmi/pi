# Internet — How It Works

## Build and packaging

`npm run build` first emits package-owned Node modules, then runs the fixed vendored daemon's pinned
Bun builder. The builder bundles the CLI, installs production dependencies, embeds Bun, and copies
the complete runtime to `dist/daemon/runtime/`. Runtime users do not install or run another repo.

## Startup

1. Pi loads `dist/extension.js`.
2. The registry returns configured accounts or synthesizes the private default account.
3. `OwnedDaemonManager` is created and passed to providers, tools, and hooks.
4. Enabled providers, seven tools, hooks, and the HUD are registered.
5. Accounts with verified login state auto-start and health-gate. Accounts without login remain
   idle, so loading Pi never unexpectedly opens Chrome.

## First login and inference

```text
select chatgpt-web model
  -> scoped before_provider_request hook calls manager.ensureReady(account)
  -> if login marker is absent: run bundled `login`
  -> dedicated Chrome profile opens; user authenticates
  -> run bundled `serve`
  -> poll /healthz until ready
  -> call Pi streamOpenAIResponses
  -> POST /v1/responses and stream assistant events
```

The login itself necessarily remains interactive. The package owns the executable, config,
invocation, isolated browser profile, and subsequent daemon lifecycle.

## Config and accounts

The default account is `127.0.0.1:17841` with private data at
`$PI_AGENT_DIR/internet/accounts/default/`. `daemon/config.ts` creates the daemon's browser-only
config, control token, storage-state path, broker socket, and bundled runtime command. Existing
config must match the account endpoint and current config schema; there is no legacy migration path.

Additional accounts require distinct config directories and ports. Registry changes activate after
Pi reload because providers are startup-scoped.

## Lifecycle control

`internet_daemon` calls the manager:

- `login`: stop the owned process, open isolated login, verify authentication marker.
- `start`: reuse a healthy endpoint or spawn `serve` and health-gate.
- `stop`: request authenticated `/admin/shutdown`, then signal as fallback.
- `restart`: stop then start.
- `status`: report process/login state.

`internet_control` is separate: it changes the running server's drain/resume/turn state rather than
owning its process.

## Compaction, status, and shutdown

`internet_status` and the HUD read `/healthz`. `internet_compact` calls
`/v1/responses/compact`; Luna is rejected because it uses rolling checkpoints. `turn_end` refreshes
the HUD. `session_shutdown` stops child processes created by this Pi session.
