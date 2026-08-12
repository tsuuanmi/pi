# Internet — Architecture

`@tsuuanmi/pi-internet` is a thin Pi extension around the local `codex-chatgpt-web` daemon. It does
not automate the browser itself and does not implement a second Responses/SSE stack.

## Runtime boundaries

```
Pi extension
├── provider registration ──> Pi openai-responses transport ──> daemon /v1/responses
├── tools ────────────────────────────────────────────────────> daemon HTTP control surface
├── account registry ───────> ~/.pi/agent/internet/accounts.json
└── HUD/hooks ──────────────> daemon /healthz and Pi lifecycle

codex-chatgpt-web daemon
└── browser automation, session credentials, replay, SSE, compaction, and turn ownership
```

The package imports only public `@tsuuanmi/pi*` entry points. Pi has no dependency on this package.

## Provider path

At startup the extension loads enabled accounts and registers one provider per account:

- one enabled account: `chatgpt-web`;
- multiple enabled accounts: `chatgpt-web-<account-id>`.

Each provider uses:

- `api: "openai-responses"`;
- `baseUrl: http://<loopback-host>:<port>/v1`;
- `authHeader: false`;
- a local placeholder API key, because Pi's OpenAI client requires a non-empty value while the
  daemon's inference routes ignore authorization and rely on loopback binding. `authHeader: false`
  prevents Pi from adding a second provider-level authorization header.

Pi's native OpenAI Responses handler owns request conversion and SSE processing. The internet
package does not parse stream frames or maintain a replay cache; those responsibilities already
belong to Pi and the daemon.

## Daemon configuration and security

Daemon configuration is read from `$CODEX_CHATGPT_WEB_HOME/config.json`, defaulting to
`~/.codex-chatgpt-web/config.json`. The file must not be group/world accessible. The package accepts
only loopback hosts (`127.0.0.1`, `localhost`, `::1`).

The daemon control token is sent only to `/admin/*` routes. It is never stored in the account
registry or attached to inference/compaction requests.

The package requires the daemon to be started externally. It surfaces configuration, reachability,
and HTTP failures explicitly; it does not silently start processes or mutate Codex configuration.

## Accounts

The registry lives at `$PI_AGENT_DIR/internet/accounts.json` (default
`~/.pi/agent/internet/accounts.json`). Writes use a temporary file plus atomic rename and enforce
`0600` permissions. Records contain only routing metadata:

```ts
{ id, backend, displayName, configDir, host, port, enabled }
```

Cookies, storage state, and control tokens remain in each daemon's private config directory.
Provider registration is startup-scoped, so account mutations require a Pi reload.

## Tools

- `internet_status`: health and active turns for the selected/default account.
- `internet_compact`: daemon replacement history; rejected for Luna because Luna uses rolling
  checkpoints.
- `internet_control`: drain, resume, shutdown, or cancel browser turns; control-token protected.
- `internet_accounts`, `internet_account_add`, `internet_account_set_enabled`: registry operations.

## Hooks and HUD

The HUD reads `/healthz` and displays active turn count plus ready/draining state. The `turn_end`
hook refreshes it. A fail-closed `tool_call` gate requires interactive approval for every daemon
control action and future `codex_*` bridged tools; no bridged tool is registered in the MVP.

## Deferred work

Browser-tool bridging, daemon process lifecycle, web search/fetch tools, and Anthropic/Google
backends are not implemented. They should be added only with concrete provider contracts and tests,
not as inert stubs.
