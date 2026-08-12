# Internet — Architecture

`@tsuuanmi/pi-internet` contains two explicit runtime layers:

```text
Pi process (Node)
├── provider registration and provider-scoped readiness hook
├── account registry and private config bootstrap
├── daemon lifecycle manager
├── daemon HTTP tools and HUD
├── settings plus public web search/fetch
└── session_shutdown cleanup

Bundled child runtime (embedded Bun)
└── codex-chatgpt-web: isolated Chrome, login/session, replay, compaction, SSE, turn ownership
```

The daemon is a fixed vendored snapshot, not a second repository dependency. We copied its existing
~15.6K lines instead of rewriting that mature browser/session behavior. The source snapshot is under
`vendor/codex-chatgpt-web/`; its build produces a ~184MB platform-specific runtime under
`dist/daemon/runtime/`.

## Dependency boundaries

- `extension.ts` composes package-owned services.
- `daemon/config.ts` creates and validates private browser-only daemon config.
- `daemon/runtime.ts` resolves and validates the bundled platform artifact.
- `daemon/manager.ts` exclusively owns login/start/stop/restart and child processes.
- `hooks.ts` readiness-gates only registered ChatGPT Web providers through
  `before_provider_request`; Pi's built-in `openai-responses` transport remains unchanged.
- `backends/openai/daemon/*` owns HTTP config/auth/client/status concerns, not processes.
- `settings.ts` owns private package settings persistence.
- `web/*` owns public search/fetch transport and its SSRF, redirect, content, timeout, and size
  safeguards. It never receives daemon credentials.
- Tools depend on the registry, settings store, daemon HTTP client, lifecycle manager, or web
  modules; those services do not depend on Pi extension APIs.

The package imports only public `@tsuuanmi/pi*` entry points. Pi does not depend on this package.

## Lifecycle

At load, authenticated enabled accounts auto-start. Accounts without verified login do not open a
browser during Pi startup. Their first model request, or explicit `internet_daemon login`, launches
the bundled `login` command with a dedicated profile unless `autoLogin` is disabled. After authentication, the manager starts
`serve`, waits for `/healthz`, and only then delegates inference to Pi.

Operations are serialized per account. A healthy daemon already bound to the account endpoint is
reused; child processes started by this manager are gracefully shut down on Pi `session_shutdown`.

## Provider path

One enabled account registers `chatgpt-web`; multiple enabled accounts register
`chatgpt-web-<account-id>`. Each provider uses `api: "openai-responses"`, loopback `/v1`, a local placeholder API key, and
`authHeader: false`. A provider-name-scoped `before_provider_request` hook performs lifecycle
readiness without replacing Pi's API-wide Responses stream registry.

Pi owns request conversion and SSE decoding. The daemon owns browser-turn replay/dedup. The package
contains no duplicate Responses parser or replay cache. Models mirror the daemon's fixed-effort
routes and are capability-scoped: Luna is exclusive to Luna accounts and Pro routes require the
cached `proAvailable` capability.

## Security and storage

The default private account directory is `$PI_AGENT_DIR/internet/accounts/default/`. The package
writes `config.json` with `0600` permissions, generates a base64url control token, binds
`127.0.0.1`, and sets an isolated storage-state/profile path. Account routing metadata remains in
`$PI_AGENT_DIR/internet/accounts.json` with atomic `0600` writes. Package settings use
`$PI_AGENT_DIR/internet/settings.json`, also written atomically with `0600` permissions.

Chrome login is interactive but package-owned: it never uses the user's normal browser profile.
Inference routes rely on a local same-user trust boundary, so another process running as the same
user could drive the browser-backed model. Admin authorization is sent only to `/admin/*` routes;
it is never sent to public web endpoints or the daemon's native Codex passthrough.

## Best of both repositories

The runtime uses codex-chatgpt-web because its Responses surface, isolated login, replay, and
compaction already match Pi. Prometheus's hybrid network-capture plus DOM-fallback design remains a
future robustness improvement; its generic MCP/multi-provider architecture is not copied into this
Pi-native boundary.
