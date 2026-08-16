# Internet Architecture

This document and the module references linked from `index.md` describe implemented behavior. Unimplemented
proposals are kept exclusively in [Future work](future-work.md).

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
ChatGPT-Web adapter. Its source lives under `runtime/`; provider-neutral code is split between
`runtime/src/core/` and the browser runtime under `runtime/src/browser/`.
ChatGPT-specific browser code lives under `browser/chatgpt-web/`; non-browser provider code lives
under `runtime/src/providers/chatgpt-web/`. See the [implemented layout](layout.md) for the
module maps.

**Core (provider-agnostic):** runtime-home and durable-command handling, atomic writes, bounded HTTP
body/event primitives, process and service lifecycle, and the Bun HTTP host. Core modules never
import browser or provider modules.

**Browser runtime:** direct `browser/*.ts` modules own provider-neutral browser/context/page leases,
response-capture lifecycle, cancellation, and cleanup. Named subdirectories such as
`browser/chatgpt-web/` own provider-specific selectors and browser flows.

**Provider layer (ChatGPT Web):** OpenAI Responses routes and projection, turn/event types, health
and control payloads, idle shutdown, models, native backend passthrough, catalog, tunnel, and web
search live under `runtime/src/providers/chatgpt-web/`. Browser automation, login, selectors,
and completion tracking live under `runtime/src/browser/chatgpt-web/`. Hosting and lifecycle
primitives remain under `runtime/src/core/`.

### Two provider boundaries

1. **Package boundary** (`src/providers/`): `openai` (ChatGPT Web daemon), `anthropic` (native
   messages), and `google` (OpenAI-compatible) implement `InternetProvider` and register with Pi.
2. **Runtime boundary** (`runtime/src/cli.ts`): the composition root loads the ChatGPT
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
  -> providers/chatgpt-web/adapter.ts
  -> browser/chatgpt-web/worker.ts (browser turn)
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

### Durable conversation lifecycle

Each Pi session maps to one stable ChatGPT conversation. The private conversation journal persists
the canonical conversation id/URL and the last acknowledged history checkpoint; the browser is an
ephemeral access mechanism, not the durable identity. Idle shutdown closes only the browser process
and tab, never the conversation or the session-to-conversation mapping. A later turn restarts the
browser, opens the saved URL, validates the checkpoint, and appends the new suffix.

- Conversation ids are immutable after the first successful turn; a later identity change fails the
turn rather than silently rebinding the session.
- Replay distinguishes acknowledged history, new suffixes, compaction boundaries, and divergence so
retries do not duplicate user turns. Rewinds, edited prefixes, changed authority, and changed
conversation ids fail closed.
- Generated `<environment_context>` messages are excluded from the persistent history prefix while
retaining original source indexes.
- Consecutive assistant phases (commentary, reasoning-only, final answer) are acknowledged as one
browser response.

**Implemented boundary.** The invariants above are live behavior. The following is **proposed, not
implemented**: a completed browser response that Pi did not persist requires explicit
acknowledgement/replay recovery so a retry replays the stored response instead of resubmitting and
never silently creates a second conversation or submits a duplicate turn. This recovery is tracked
in [Future work](future-work.md).

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

## Design lineage

The package is a deliberate composition of three prior repos, not a copy of any one. The
composition is what makes it unique.

| Concern | codexweb (Council 3.x) | pi-internet-runtime (daemon) | Prometheus | internet takes |
|---|---|---|---|---|
| Browser runtime / Responses surface | Electron + Playwright Council | Bun daemon, `/v1/responses`, isolated login, replay, compaction, broker, MCP | Electron + Playwright, 11 providers | **Pi-owned runtime daemon** |
| Model-output capture | DOM (Council turns) | Authenticated conversation wire payload | Network interception (SSE/JSON) | **Authoritative wire capture** for the runtime adapter |
| Multi-agent Council | core feature | — | — | **`internet_council` bounded workflow** |
| Multi-provider breadth | — | single ChatGPT path | 11-provider catalog | **Provider seam** — Anthropic/Google API providers; future browser-backed adapters |
| Web search / fetch | — | removed | browser-based | **Keyless RSS + bounded SSRF-safe fetch** |
| `@file` / local tools | Council MCP | Full-mode broker/MCP | inline `@file` expansion | **Bounded workspace-local `@file`** |
| Integration surface | Electron app | HTTP daemon | MCP + REST | **Pi provider + tools** |
| Platform | 4-platform Electron | Bun runtime (platform-agnostic build) | Linux | **Linux and macOS** |

What makes internet unique:

1. **Pi-native provider registration** — neither codexweb nor Prometheus registers as a Pi provider.
2. **Browser-optional** — only ChatGPT Web model routing needs the daemon's Chrome; search/fetch and
   Anthropic/Google API providers are browser-less.
3. **Self-contained** — bundles the daemon and embeds Bun; no other repo at runtime.
4. **Keyless, SSRF-safe web access** — `internet_search`/`internet_fetch` are not browser-driven and
   never forward daemon credentials.
5. **Owned lifecycle** — the package owns login/start/stop/restart and health-gated auto-start.

## Landed features

The original MVP was "provider + thin tools + HUD + one hook". Since then the following are
implemented and production scope:

- **R1 — Fixed-effort model metadata.** Models mirror the daemon's single-immutable-effort routes
  (`light`/`medium`/`high`/`extra-high`/`pro`), capability-gated for Pro, with a conservative 16,384
  output ceiling. Provider-local ids render as `chatgpt-web/high` instead of a doubled prefix.
- **R2 — `autoLogin` opt-out flag.** Lazy login is opt-out via `internet_settings`; headless users
  are not surprised by a Chrome window.
- **R2b — Conversation continuity + unobtrusive headed browser.** See the durable conversation
  lifecycle above.
- **R3 — `internet_search` + `internet_fetch`.** Keyless RSS search plus bounded, SSRF-aware page
  fetching. Read-only, no interactive approval.
- **R4 — `internet_doctor`.** Bounded, cancellable `doctor --json` diagnostics with strict report
  validation.
- **R4b — Full harness / local file access.** Account-scoped `internet_harness`; safe static `@file`
  expansion in both modes; Full mode wires the runtime broker/MCP path with private runtime-key
  storage.
- **Account-scoped tools and stable provider names.** `chatgpt-web` for `default`, `chatgpt-web-<id>`
  for others; enabling/disabling unrelated accounts does not rename a provider.
- **Owned daemon lifecycle.** Package-owned private config, isolated Chrome login, health-gated
  auto-start, serialized lifecycle, graceful shutdown, and the `internet_daemon` tool.

Remaining roadmap: **Fusion** (`internet_ask_all`), a later, larger bet on top of the implemented
multi-provider seam. See [Future work](future-work.md).
