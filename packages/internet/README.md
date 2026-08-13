# @tsuuanmi/pi-internet

Linux-first Pi extension that ships its own `codex-chatgpt-web` runtime and exposes ChatGPT Web as a
Pi model provider. No separate daemon repository, Bun installation, or manually started service is
required at runtime.

The package vendors a fixed daemon snapshot rather than rewriting it: Pi owns model/provider
integration and Responses streaming; the bundled daemon owns isolated Chrome automation, ChatGPT
session state, replay, compaction, and turn execution.

## Requirements

- Node.js >= 22.19.0.
- Linux on the architecture recorded in `dist/daemon/runtime/manifest.json` (currently linux-x64).
- Google Chrome at `/usr/bin/google-chrome`.
- A ChatGPT account. First login is interactive in a dedicated Chrome profile.
- Bun 1.3.14 only when building the package from source. Published/runtime use embeds Bun.

## Build

```bash
cd packages/internet
npm run build
```

The build compiles package integration code and builds the fixed vendored snapshot into
`dist/daemon/runtime/`. The resulting self-contained daemon payload is about 184MB and includes Bun,
the bundled CLI, Playwright runtime dependencies, and a launcher.

## First use

1. Build and load Pi normally. The package is auto-discovered through its `pi.extensions` manifest.
2. Select one of the capability-scoped `chatgpt-web/*` routes, or run `internet_daemon` with
   `action: "login"`.
3. The package opens Google Chrome with a dedicated profile under
   `$PI_AGENT_DIR/internet/accounts/default/browser/`.
4. Sign in to ChatGPT, confirm the composer is visible, then close that dedicated Chrome instance.
5. The daemon reopens the profile in a Keychain-aware Playwright context, captures state, and
   verifies it independently in a second owned context.
6. The package starts its daemon and waits for `/healthz` before inference continues.

On later Pi loads, authenticated enabled accounts start automatically. The daemon keeps one ChatGPT
conversation per Pi session ID and stays alive while that session is active, then shuts itself down
~1 minute after the last request/message. To require explicit login, call `internet_settings`
with `{ "autoLogin": false }`; first-use model requests then keep Chrome closed and instruct
interactive users to run `internet_daemon` with action `login`.

## Runtime flow

```text
Pi before_provider_request hook (registered ChatGPT Web providers only)
  -> ensure verified login (interactive on first use)
  -> ensure package-owned daemon is healthy
  -> Pi openai-responses conversion
  -> expand safe workspace-local @file references
  -> add stable session/turn identity and read-only environment metadata
  -> bundled daemon /v1/responses and Pi SSE decoding
  -> isolated Chrome profile and ChatGPT Web
```

The request adapter uses Pi's stable session and active user-entry identities so daemon replay keeps
the same turn across retries/tool rounds and starts a new turn for each new user revision. The daemon
binds to loopback only. Its private config and generated control token live inside the account config
directory with `0600` permissions.

## Providers and accounts

One enabled account registers `chatgpt-web`; multiple enabled accounts register
`chatgpt-web-<account-id>`. Account metadata is stored atomically at
`$PI_AGENT_DIR/internet/accounts.json` (default `~/.pi/agent/internet/accounts.json`). The default
account uses `127.0.0.1:17841` and stores private daemon/browser data under
`$PI_AGENT_DIR/internet/accounts/default/`.

Account registry changes require a Pi reload because provider registration is startup-scoped.

## Tools

| Tool | Purpose |
|---|---|
| `internet_daemon` | Login, start, stop, restart, or inspect the package-owned daemon. |
| `internet_harness` | Inspect/configure account-scoped Full local-tools mode and tunnel paths. |
| `internet_status` | Read daemon health and active turn counts. |
| `internet_doctor` | Run account-scoped daemon diagnostics and return structured check results. |
| `internet_compact` | Compact history; rejected for Luna because Luna uses rolling checkpoints. |
| `internet_control` | Drain/resume/shutdown/cancel daemon browser turns through `/admin/*`. |
| `internet_accounts` | List account routing metadata. |
| `internet_account_add` | Add an isolated account config directory and loopback endpoint. |
| `internet_account_set_enabled` | Enable or disable an account. |
| `internet_settings` | Inspect or update package settings such as automatic login. |
| `internet_search` | Search the public web and return source URLs with snippets. |
| `internet_fetch` | Fetch readable text from a bounded public HTTP/HTTPS page. |

`internet_daemon` controls the child-process lifecycle. `internet_control` controls the running
server's administrative state. `internet_harness` enables/disables the vendored broker/MCP Full mode
using an external tunnel client, tunnel ID, and private runtime-key file. Destructive/full-harness
calls require Pi's interactive approval hook.
`internet_doctor` is read-only: it runs the bundled CLI's bounded `doctor --json` command without
starting the daemon or opening Chrome. It retains every daemon check with explicit Pi/upstream scope
and computes Pi readiness without requiring the daemon's native Codex route or OS service.

## Security

- Chrome uses a package-owned `--user-data-dir`; the user's normal browser profile is never used.
- Config, settings, cookies, storage state, and control tokens stay under private package paths.
- Only `127.0.0.1` is accepted. Inference routes intentionally rely on the local same-user trust
  boundary, so another process running as the same user could drive the browser-backed model.
- Admin bearer credentials are sent only to `/admin/*`, never to inference or public web routes.
- Web fetch blocks URL credentials, non-HTTP schemes, private/reserved destinations, unsafe
  redirects, binary responses, oversized bodies, and long-running requests.
- Explicit `@file` references send the selected workspace file contents to ChatGPT; do not reference
  secrets or files that should not leave the machine.
- Snapshot provenance and the targeted upstream v2.1.9 login patch are recorded in
  `vendor/codex-chatgpt-web/SNAPSHOT.md`; general upstream synchronization remains out of scope.
- This is unofficial browser automation and can break when ChatGPT Web changes. It must not be used
  to evade usage limits or access controls.

## Development checks

```bash
npm run build
npm test
cd ../..
npx biome check --write --error-on-warnings packages/internet
npx tsgo --noEmit
```

Tests import package code from `dist`, so rebuild before testing. The vendored source is built by its
pinned Bun toolchain and is intentionally excluded from Pi's TypeScript/Biome source globs.

## Documentation

- [Usage Guide](docs/usage.md) — how to use `@file`, `internet_search`/`internet_fetch`, lifecycle
  tools, and the Full-harness `codex_*` local tools.
- [Architecture](docs/architecture.md)
- [How it works](docs/how-it-works.md)
- [Pi integration](docs/pi-integration.md)
- [Layout](docs/layout.md)
- [Implementation phases](docs/implementation-phases.md)
- [Daemon ownership decisions](docs/daemon-ownership-brainstorm.md)
- [Implementation review](docs/review/implementation-review.md)
- [Conversation Continuity and Browser Lifecycle](docs/implementation-plan-conversation-continuity.md)
- [Full Harness and Local File Access](docs/implementation-plan-full-harness.md)

## Deferred

Hybrid network-interception/DOM capture inspired by Prometheus, multi-backend fusion, and non-Linux
runtime artifacts remain future work. Full-harness connector setup and tunnel credentials remain
external prerequisites.
