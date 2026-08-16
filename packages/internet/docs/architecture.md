# Internet Architecture

## Boundaries

Pi owns provider registration, request transport, model selection, tool approval, session model
services, and HUD/tool presentation. Internet owns account routing, the ChatGPT Web process/browser
boundary, API provider composition, public-web safety, and bounded council orchestration.

```text
Pi extension host
  ├─ AccountRegistry (versioned account metadata)
  ├─ provider registry
  │    ├─ openai -> per-account loopback Responses daemon
  │    ├─ anthropic -> native anthropic-messages provider
  │    └─ google -> Google OpenAI-compatible provider
  ├─ OwnedDaemonManager (ChatGPT Web accounts only)
  ├─ CouncilService -> @tsuuanmi/pi-orchestrator
  └─ tools / hooks / HUD
```

## Browser runtime (provider-agnostic core + provider layer)

The package owns a neutral private runtime and compiles it into a self-contained Bun launcher for
Linux or macOS (`x64`/`arm64`). The host provides Google Chrome; no Playwright browser payload is
downloaded at runtime. Runtime manifests and launcher containment/executable permissions are
validated before spawn.

The private daemon is a **browser-backed inference daemon** with a provider-agnostic core and a
ChatGPT-Web adapter. Its source lives under `vendor/runtime/`; provider-neutral code is split between
`vendor/runtime/src/core/` and the reusable browser runtime under `vendor/runtime/src/browser/`;
provider-specific code is organized under `vendor/runtime/src/providers/chatgpt-web/`. See the canonical
[provider-neutral runtime boundary](review/daemon-boundary.md) review for the full module map. The
next boundary review proposes decomposing the current ChatGPT browser worker and extracting its
reusable mechanics into a `vendor/runtime/src/browser/` layer between these core and provider
directories: [Browser and provider boundary review](review/browser-provider-boundary.md).

**Core (provider-agnostic):** runtime-home and durable-command handling, atomic writes, bounded HTTP
body/event primitives, process and service lifecycle, and the Bun HTTP host. Core modules never
import browser or provider modules.

**Browser runtime (provider-agnostic):** browser/context/page ownership, bounded page sessions,
response-capture lifecycle, cancellation, and cleanup. Browser modules never import provider
protocols or product selectors.

**Provider layer (ChatGPT Web):** the OpenAI Responses routes and projection, turn/event types,
health and control payloads, idle shutdown, browser automation against `chatgpt.com`, session,
models, login, native backend passthrough, model catalog, tunnel, and web search. These live under
`vendor/runtime/src/providers/chatgpt-web/`; reusable browser mechanics live under
`vendor/runtime/src/browser/`, while hosting and lifecycle primitives live under
`vendor/runtime/src/core/`.

### Two provider boundaries

1. **Package boundary** (`src/providers/`): `openai` (ChatGPT Web daemon), `anthropic` (native
   messages), and `google` (OpenAI-compatible) implement `InternetProvider` and register with Pi.
2. **Runtime boundary** (`vendor/runtime/src/cli.ts`): the composition root loads the ChatGPT
   adapter. The adapter depends on neutral runtime primitives; neutral runtime modules do not depend
   on the adapter.

The package boundary is multi-provider. The isolated browser runtime currently has one adapter, so
it uses direct composition instead of a speculative registry.

### Request flow through the runtime

```text
HTTP POST /v1/responses
  -> core server.ts (Bun HTTP host)
  -> providers/chatgpt-web/server/routes.ts (bounded body and route dispatch)
  -> providers/chatgpt-web/protocol/responses/parser.ts
  -> providers/chatgpt-web/adapter.ts (browser turn)
  -> providers/chatgpt-web/protocol/responses/bridge.ts (Responses SSE)
  -> HTTP 200 text/event-stream
```

The `core/` modules own reusable hosting and lifecycle primitives. The adapter owns the complete external
protocol and browser-turn semantics. This keeps OpenAI/Codex wire concepts out of neutral modules
and gives a future adapter an explicit inward-only dependency on the core.

Each browser account owns one config directory, storage state, verification marker, loopback port,
serialized lifecycle queue, and optional Full-mode tunnel. The manager accepts only narrowed
`OpenAiInternetAccount` values, so API accounts cannot cross the process boundary.

Browser turns use authenticated wire response capture as the authoritative answer source. The
adapter fails clearly when no valid conversation payload is available; it does not fall back to
legacy DOM extraction. The daemon remains authoritative for replay, durable conversation IDs, rolling
checkpoints, browser health, and Full-mode broker operation.

## API providers

Anthropic and Google providers are pure registration adapters. They do not own processes or browser
state. Registry entries contain an `apiKeyEnv` reference, and Pi resolves `$ENV_VAR` credentials at
request time. Provider names, endpoint mappings, model metadata, and account provider naming are
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
