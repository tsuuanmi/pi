# Internet — How It Works

## Build and packaging

`npm run build` first emits package-owned Node modules, then runs the fixed vendored daemon's pinned
Bun builder. The builder bundles the CLI, installs production dependencies, embeds Bun, and copies
the complete runtime to `dist/daemon/runtime/`. Runtime users do not install or run another repo.

## Startup

1. Pi loads `dist/extension.js`.
2. The registry returns configured accounts or synthesizes the private default account.
3. `OwnedDaemonManager` is created and passed to providers, tools, and hooks.
4. Enabled providers, twelve tools, hooks, and the HUD are registered.
5. Accounts with verified login state auto-start and health-gate. Accounts without login remain
   idle, so loading Pi never unexpectedly opens Chrome.

## First login and inference

```text
select chatgpt-web model
  -> scoped before_provider_request hook calls manager.ensureReady(account)
  -> if login marker is absent: run bundled `login`
  -> dedicated Chrome profile opens; user authenticates and closes that Chrome instance
  -> daemon reopens the profile, captures state, and independently verifies it
  -> run bundled `serve`
  -> poll /healthz until ready
  -> Pi converts the request to OpenAI Responses format
  -> hook adds stable session/turn identity and trusted read-only environment
  -> POST /v1/responses and stream assistant events
```

The login itself necessarily remains interactive. The package owns the executable, config,
invocation, isolated browser profile, and subsequent daemon lifecycle. After Pi's standard request conversion, `backends/openai/turn/files.ts` safely expands bounded
workspace-local `@file` references, then `backends/openai/turn/request.ts` derives thread identity
from the Pi session and turn identity from the active branch's latest persisted user entry. This keeps retries/tool rounds stable
while each new user revision starts a new browser turn. With `autoLogin:false`, the readiness hook
leaves Chrome closed and notifies interactive users to run `internet_daemon login`.

## Config and accounts

The default account is `127.0.0.1:17841` with private data at
`$PI_AGENT_DIR/internet/accounts/default/`. `daemon/config.ts` creates the daemon config, compact
headed-window settings, ~1 minute idle shutdown, control token, storage-state path, broker socket,
and bundled runtime command. `daemon/harness.ts` switches an account between browser-only and Full
mode without putting tunnel-key text in Pi history. Existing
config must match the account endpoint and current config schema; there is no legacy migration path.

Additional accounts require distinct config directories and ports. Registry changes activate after
Pi reload because providers are startup-scoped. `$PI_AGENT_DIR/internet/settings.json` stores the
private package settings, including `autoLogin`.

## Lifecycle control

`internet_daemon` calls the manager:

- `login`: stop the owned process, open isolated login, verify authentication marker.
- `start`: reuse a healthy endpoint or spawn `serve` and health-gate.
- `stop`: request authenticated `/admin/shutdown`, then signal as fallback.
- `restart`: stop then start.
- `status`: report process/login state.

`internet_control` is separate: it changes the running server's drain/resume/turn state rather than
owning its process. `internet_harness` configures browser-only or Full local-tools mode and restarts
the account daemon when the mode changes. `internet_doctor` runs the account-scoped bundled `doctor --json` command with a
bounded timeout/output limit and returns its structured checks. It does not start the daemon, open
Chrome, or mutate account state.

## Web access

`internet_search` queries a keyless public RSS search endpoint and returns bounded result metadata.
It deliberately does not call the daemon's `/v1/alpha/search`: that endpoint forwards a native
Codex bearer credential upstream, while browser-only accounts do not own such a credential and the
admin control token must never be forwarded. `internet_fetch` follows only validated public
HTTP/HTTPS redirects and returns bounded text after blocking private/reserved destinations and
unsupported content.

## Diagnostics, compaction, status, and shutdown

`internet_doctor` invokes the CLI because the daemon has no doctor HTTP route. A validated failing
report is returned even though the CLI uses exit status 1 for failed checks. All checks are retained
with Pi/upstream scope, while Pi readiness ignores native Codex-route and OS-service requirements.
Command, timeout, cancellation, and malformed-report failures are typed separately. `internet_status` and the HUD
read `/healthz`. `internet_compact` calls
`/v1/responses/compact`; Luna is rejected because it uses rolling checkpoints. `turn_end` refreshes the HUD. The daemon keeps one ChatGPT conversation per Pi session and remains alive while the
session is active, then owns its browser/broker/tunnel cleanup and exits automatically after ~1
minute without a new request/message.
