# @tsuuanmi/pi-internet

Pi extension that exposes the local [`codex-chatgpt-web`](https://github.com/tsuuanmi/codex-chatgpt-web)
daemon as a ChatGPT Web model provider. It lets a Pi agent select a ChatGPT Web route as its model
and stream inference through the daemon, while also providing status, compaction, control, and
multi-account management tools.

The package is a thin wrapper: it does **not** automate the browser, parse Responses SSE itself, or
maintain a replay cache. Pi's native `openai-responses` transport owns request conversion and
streaming; the daemon owns browser automation, session credentials, replay, and turn ownership.

---

## Prerequisites

- **Node.js >= 22.19.0** (for the Pi package).
- **Bun 1.3.14+** (required to run the `codex-chatgpt-web` daemon from source).
- **Google Chrome or Chromium** installed (the daemon uses it for the ChatGPT sign-in handoff and
  embedded browser).
- A **ChatGPT account** signed in through the daemon's launcher/setup flow.
- A **Pi checkout** with this package present at `packages/internet` (it is auto-discovered).

---

## Step-by-step setup

### Step 1 — Install and configure the daemon

The daemon is external to this package. Install it from its own repository:

```bash
git clone https://github.com/miuuyy/codex-chatgpt-web.git
cd codex-chatgpt-web
bun install
```

Run the interactive setup, which signs you into ChatGPT and writes the daemon config:

```bash
bun run setup
```

During setup:

1. Sign in through the dedicated Chrome/Chromium window the launcher opens and leave it open.
2. Run the browser smoke test.
3. Press **Install models** and restart Codex once.

The setup writes the daemon config to:

```
$CODEX_CHATGPT_WEB_HOME/config.json     # default: ~/.codex-chatgpt-web/config.json
```

### Step 2 — Verify the daemon config

The package reads `config.json` and requires:

- `host` must be `127.0.0.1` (loopback only).
- `port` must be a valid port (default `17841`).
- `controlToken` must be a base64url string of **at least 40 characters**.
- The file must **not** be group/world readable (the package rejects `0640`/`0666`).

You can check it with:

```bash
cat ~/.codex-chatgpt-web/config.json
```

If the file is missing, run `bun run setup` first. The package surfaces a clear
`config_missing` / `config_invalid` error otherwise.

### Step 3 — Start the daemon

Start the daemon service (it must be running for inference, status, compaction, and control):

```bash
bun run start        # equivalent to: bun run src/cli.ts serve
```

You can confirm it is healthy:

```bash
bun run doctor
```

or, from the package, run the `internet_status` tool once Pi is loaded.

### Step 4 — Build the Pi package

Pi loads from `dist/`, so build the package before using it:

```bash
cd packages/internet
npm run build
```

### Step 5 — Load the package in Pi

The package is **auto-discovered**: Pi's bundled-package loader scans `packages/` for any directory
with a valid `pi` manifest and a built `dist/`. `internet` qualifies and loads as `pi:internet` — no
settings change is required.

If you prefer explicit control, add it through Pi's package/extension settings:

```jsonc
{
  "packages": ["@tsuuanmi/pi-internet"],
  "extensions": ["./packages/internet"]
}
```

### Step 6 — Use it

Once loaded, the extension:

- Registers the `chatgpt-web` provider, so you can select a ChatGPT Web route as your model
  (e.g. `chatgpt-web/high` or `chatgpt-web/luna`).
- Exposes the tools: `internet_status`, `internet_compact`, `internet_control`,
  `internet_accounts`, `internet_account_add`, `internet_account_set_enabled`.
- Shows active turns and ready/draining state in the HUD.

> **Known limitation (from the implementation review):** the model metadata currently advertises
> multi-level reasoning efforts, but the daemon routes each advertise a single immutable effort.
> Model inference may send reasoning-effort values a route does not accept. The tools, HUD, and
> status surface work as-is; align the model metadata to the daemon's route semantics before relying
> on model routing in production. See
> [docs/review/implementation-review.md](docs/review/implementation-review.md).

---

## Features

- **Provider routing** — registers a `chatgpt-web` provider through Pi's native `openai-responses`
  transport so the agent can select a ChatGPT Web route as its model.
- **Daemon routes** — publishes the daemon's `chatgpt-web/high` and `chatgpt-web/luna` routes.
- **Secure config** — reads daemon connection and control credentials from
  `$CODEX_CHATGPT_WEB_HOME/config.json`, enforcing loopback-only hosts and private file permissions.
- **Tools** — status, compaction, control, and account-management tools.
- **HUD** — shows active daemon turns and ready/draining state in the status line.
- **Multi-account** — supports multiple local daemon accounts through an atomic, private account
  registry.

---

## How it works

### Startup

1. Pi loads `dist/extension.js` and awaits the default extension factory.
2. The account registry loads persisted records. If none exist, it synthesizes a `default` account
   from daemon config, or from the documented loopback default (`127.0.0.1:17841`).
3. Enabled accounts are registered as Pi `openai-responses` providers.
4. The extension registers tools, hooks, and the HUD provider.

Provider registration does not require the daemon to be running. A model request or daemon tool
returns a clear connection error if it is unavailable.

### Model inference

```
Pi selects chatgpt-web/high or chatgpt-web/luna
        │
        ▼
Pi's native openai-responses stream handler
        │ POST http://127.0.0.1:17841/v1/responses
        ▼
codex-chatgpt-web daemon
        │ browser turn + standard Responses SSE
        ▼
Pi's native handler streams assistant events
```

### Provider registration

Each enabled account is registered as a provider:

- one enabled account: `chatgpt-web`;
- multiple enabled accounts: `chatgpt-web-<account-id>`.

Each provider uses:

- `api: "openai-responses"`;
- `baseUrl: http://<loopback-host>:<port>/v1`;
- `authHeader: false`;
- a local placeholder API key, because Pi's OpenAI client requires a non-empty value while the
  daemon's inference routes ignore authorization and rely on loopback binding.

The canonical model ids are daemon route slugs (`chatgpt-web/high`, `chatgpt-web/luna`); Pi passes
them through to `/v1/responses` unchanged.

---

## Tools

| Tool | Description |
|------|-------------|
| `internet_status` | Show daemon health and active turn counts for the selected/default account. |
| `internet_compact` | Compact conversation history through the daemon; rejected for Luna (rolling checkpoints). |
| `internet_control` | Drain, resume, shut down, or cancel browser turns; control-token protected. |
| `internet_accounts` | List configured internet backend accounts. |
| `internet_account_add` | Add a ChatGPT Web daemon account. |
| `internet_account_set_enabled` | Enable or disable an account. |

### Control actions

`internet_control` maps to the daemon's `/admin/*` routes:

| Action | Route |
|--------|-------|
| `drain` | `POST /admin/drain` |
| `resume` | `POST /admin/resume` |
| `shutdown` | `POST /admin/shutdown` |
| `cancel-browser-turns` | `POST /admin/cancel-browser-turns` |

Only these calls include `Authorization: Bearer <controlToken>`. A daemon refusal, including a 409
shutdown refusal while turns are active, is surfaced as a typed `InternetError`.

Account changes take effect after Pi reloads so provider registration remains startup-scoped.

---

## Security

- Daemon configuration is read from `$CODEX_CHATGPT_WEB_HOME/config.json` and must not be
  group/world accessible.
- Only loopback hosts are accepted (`127.0.0.1`, `localhost`, `::1`).
- The daemon control token is sent only to `/admin/*` routes. It is never stored in the account
  registry or attached to inference/compaction requests.
- The account registry lives at `$PI_AGENT_DIR/internet/accounts.json` (default
  `~/.pi/agent/internet/accounts.json`). Writes use a temporary file plus atomic rename and enforce
  `0600` permissions. Records contain only routing metadata:
  `{ id, backend, displayName, configDir, host, port, enabled }`.
- Cookies, storage state, and control tokens remain in each daemon's private config directory.
- The package requires the daemon to be started externally. It surfaces configuration,
  reachability, and HTTP failures explicitly; it does not silently start processes or mutate Codex
  configuration.

---

## Hooks and HUD

The HUD reads `/healthz` and displays active turn count plus ready/draining state. The `turn_end`
hook refreshes it. A fail-closed `tool_call` gate requires interactive approval for every daemon
control action and future `codex_*` bridged tools; no bridged tool is registered in the MVP.

---

## Development

```bash
cd packages/internet
npm run build
npm test
```

Tests import from `dist/`, so rebuild before running them.

### Checks

- Build: `npm run build`
- Tests: `npm test`
- Lint/format: `npx biome check --write --error-on-warnings packages/internet`
- Typecheck: `npx tsgo --noEmit` (from the repo root)

---

## Documentation

- [Architecture](docs/architecture.md) — runtime boundaries, provider path, security model.
- [How it works](docs/how-it-works.md) — startup, inference, status, compaction, control, accounts.
- [Pi integration](docs/pi-integration.md) — extension contract, provider config, hooks, discovery.
- [Layout](docs/layout.md) — the implemented source tree and responsibilities.
- [Implementation phases](docs/implementation-phases.md) — reviewed decisions and completed phases.
- [Implementation review](docs/review/implementation-review.md) — review-only findings on the MVP.

---

## Deferred work

Browser-tool bridging, daemon process lifecycle, web search/fetch tools, and Anthropic/Google
backends are not implemented. They should be added only with concrete provider contracts and tests,
not as inert stubs.
