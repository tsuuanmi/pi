# Internet Architecture

## Boundaries

Pi owns provider registration, request transport, model selection, tool approval, session model
services, and HUD/tool presentation. Internet owns account routing, the ChatGPT Web process/browser
boundary, API backend composition, public-web safety, and bounded council orchestration.

```text
Pi extension host
  ├─ AccountRegistry (schema 2)
  ├─ provider registry
  │    ├─ openai -> per-account loopback Responses daemon
  │    ├─ anthropic -> native anthropic-messages provider
  │    └─ google -> Google OpenAI-compatible provider
  ├─ OwnedDaemonManager (ChatGPT Web accounts only)
  ├─ CouncilService -> @tsuuanmi/pi-orchestrator
  └─ tools / hooks / HUD
```

## ChatGPT Web runtime

The package vendors a reviewed `codex-chatgpt-web` snapshot and compiles it into a self-contained Bun
launcher for Linux or macOS (`x64`/`arm64`). The host provides Google Chrome; no Playwright browser
payload is downloaded at runtime. Runtime manifests and launcher containment/executable permissions
are validated before spawn.

Each browser account owns one config directory, storage state, verification marker, loopback port,
serialized lifecycle queue, and optional Full-mode tunnel. The manager accepts only narrowed
`OpenAiInternetAccount` values, so API accounts cannot cross the process boundary.

Browser turns use wire response capture as the primary answer source. The existing DOM extraction is
the explicit compatibility fallback when no valid authenticated conversation payload is available.
The daemon remains authoritative for replay, durable conversation IDs, rolling checkpoints, browser
health, and Full-mode broker operation.

## API providers

Anthropic and Google providers are pure registration adapters. They do not own processes or browser
state. Registry entries contain an `apiKeyEnv` reference, and Pi resolves `$ENV_VAR` credentials at
request time. Backend names, endpoint mappings, model metadata, and account provider naming are
centralized under `src/providers/`.

## Council

`CouncilService` only sees models whose providers belong to enabled internet accounts. It creates
one tool-free Pi Agent per selected model, runs independent tasks with bounded concurrency, then
runs one dependency-aware chair synthesis through `@tsuuanmi/pi-orchestrator`. Caps are fixed in
production: 2–6 members, three concurrent tasks, one start per task, no retries, 4,096 output tokens
per response, and a ten-minute run limit.

## Security invariants

- Daemons bind only to `127.0.0.1`; browser endpoints must be unique.
- Account/config/settings/auth files are private and atomically written.
- Imported storage state must be a bounded regular file, is filtered to ChatGPT/OpenAI domains, and
  is persisted only after browser verification.
- API secret values are not stored in account metadata or tool output.
- Public fetch rejects credentials, fragments, non-HTTP schemes, unsafe ports, and private/reserved
  DNS results, including redirect revalidation.
- Full-mode local tools remain account-scoped and approval-gated by Pi.
- Council members receive no tools and cannot select models outside enabled internet providers.
