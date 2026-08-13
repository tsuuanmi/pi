# Internet Package

Internet is the Linux-first Pi package that ships an isolated ChatGPT Web browser runtime and
registers it as a native Pi model provider. It vendors a fixed codex-chatgpt-web snapshot, embeds
Bun in the build artifact, owns first login and daemon lifecycle, and requires no other repository
at runtime.

> Status: **owned-daemon MVP plus R1–R4 implemented.** Fixed-effort models, explicit automatic-login
> settings, read-only web search/fetch, and account diagnostics are current production scope.

## Core documentation

- [Architecture](architecture.md) — process boundaries, lifecycle authority, security, and the
  accepted ~15.6K-line vendoring tradeoff.
- [How it works](how-it-works.md) — build, startup, first login, inference, and shutdown flows.
- [Implemented Layout](layout.md) — package-owned modules, vendor snapshot, and build output.
- [Pi Integration](pi-integration.md) — provider-scoped readiness stream, tools, hooks, and public
  API boundaries.
- [Usage Guide](usage.md) — how to use `@file`, web, lifecycle, and Full-harness `codex_*` tools.

## Source reference

Module docs mirror `packages/internet/src/` one-to-one; each page documents a matching source
file's public exports and behavior. This is the source-of-truth reference for how the package owns
its daemon, providers, tools, and web transport.

### `src/index.ts` — package public API

`src/index.ts` is the package entry point. It re-exports the extension-facing pieces and typed
internals used by tests and other packages:

- `AccountRegistry`, `getAccountRegistryPath` — account routing registry and its default path.
- `DEFAULT_DAEMON_HOST`, `DEFAULT_DAEMON_PORT`, `daemonBaseUrl`, `getDaemonConfigDir`,
  `readDaemonConfig` — daemon endpoint auth/base-URL helpers.
- `DaemonClient` — HTTP daemon client class.
- `readDaemonStatus`, `readDaemonStatusSnapshot` — daemon health/status readers and the HUD provider.
- `chatGptWebModels`, `registerOpenAiProviders` — capability-scoped model metadata and provider
  registration.
- `InternetError`, `isInternetError` — typed error and type guard.
- `daemonConfigPath`, `daemonLoginExists`, `ensureOwnedDaemonConfig`, `syncOwnedDaemonCapabilities` —
  owned daemon configuration helpers.
- `OwnedDaemonManager` — daemon/tunnel lifecycle owner class.
- `resolveDaemonRuntime` — bundled runtime artifact resolution.
- `registerInternetHooks` — extension hook registration.
- `registerInternetTools` — extension tool registration.
- `VERSION` — package version constant.

The package re-exports `InternetSettingsService` as a type only; the concrete
`InternetSettingsStore` class is not part of the public index surface.

### Module map

- [extension](extension.md) — `src/extension.ts`, the extension composition root loaded by Pi.
- [hooks](hooks.md) — `src/hooks.ts`, provider-scoped readiness/adaptation gate and HUD refresh.
- [settings](settings.md) — `src/settings.ts`, atomic private package settings.
- [version](version.md) — `src/version.ts`, the package version constant.
- [accounts/registry](accounts/registry.md) — account routing metadata and atomic persistence.
- [core/types](core/types.md) — shared account/settings/control types.
- [core/errors](core/errors.md) — `InternetError` and type guard.
- [daemon/config](daemon/config.md) — owned daemon/browser configuration, capabilities, login
  markers, and secure atomic writes.
- [daemon/runtime](daemon/runtime.md) — bundled artifact resolution and platform validation.
- [daemon/harness](daemon/harness.md) — account-scoped Full-mode paths and private runtime-key
  storage.
- [daemon/manager](daemon/manager.md) — the single daemon/tunnel lifecycle owner.
- [daemon/doctor](daemon/doctor.md) — bounded CLI diagnostics with strict report validation.
- [daemon/health](daemon/health.md) — startup health polling.
- [backends/openai/index](backends/openai/index.md) — backend barrel exports.
- [backends/openai/provider](backends/openai/provider.md) — capability-scoped provider config and
  naming.
- [backends/openai/models](backends/openai/models.md) — capability-scoped model metadata.
- [backends/openai/daemon/auth](backends/openai/daemon/auth.md) — daemon endpoint auth, base URL, and
  config dir helpers.
- [backends/openai/daemon/client](backends/openai/daemon/client.md) — HTTP daemon client.
- [backends/openai/daemon/routes](backends/openai/daemon/routes.md) — daemon route and payload shapes.
- [backends/openai/daemon/status](backends/openai/daemon/status.md) — daemon status snapshots and the
  HUD provider.
- [backends/openai/turn/model](backends/openai/turn/model.md) — model routes, reasoning levels, and
  the Luna special case.
- [backends/openai/turn/request](backends/openai/turn/request.md) — pure daemon identity/environment
  payload adaptation.
- [backends/openai/turn/files](backends/openai/turn/files.md) — bounded workspace-local `@file`
  expansion.
- [tools/register](tools/register.md) — the tool registration aggregator.
- [tools/accounts](tools/accounts.md) — account listing/adding/enabling tools.
- [tools/status](tools/status.md) — daemon health/status tool.
- [tools/doctor](tools/doctor.md) — daemon diagnostics tool.
- [tools/control](tools/control.md) — admin drain/resume/shutdown/cancel tool.
- [tools/compact](tools/compact.md) — history compaction tool.
- [tools/daemon](tools/daemon.md) — login/start/stop/restart/status tool.
- [tools/harness](tools/harness.md) — Full-harness enable/disable/restart/status tool.
- [tools/settings](tools/settings.md) — package settings inspection/update tool.
- [tools/web](tools/web.md) — `internet_search` and `internet_fetch` tools.
- [web/fetch](web/fetch.md) — bounded, SSRF-safe page fetching.
- [web/search](web/search.md) — Bing RSS-backed web search.

## Implementation reviews

- [Implementation Review](review/implementation-review.md) — review findings and dispositions.
- [Original MVP Review](review/review-and-brainstorm.md) — MVP review and follow-on brainstorm.

## Plans and design research

Forward-looking plans, design research, and brainstorm docs live in [`plan/`](plan/), and are not yet
production scope.

- [Daemon Ownership Decisions](plan/daemon-ownership-brainstorm.md) — investigation history, Bun/Node
  constraint, measured runtime footprint, and confirmed decisions.
- [Source Repositories](plan/source-repositories.md) — source map for Pi, codex-chatgpt-web, and
  Prometheus.
- [Comparison: Prometheus](plan/comparison-prometheus.md) — browser-backend comparison and lessons.
- [Best of Both](plan/best-of-both.md) — future hybrid network capture with DOM fallback and fusion.
- [Browser Design](plan/browser-design.md) — isolated browser behavior and security checklist.
- [Multi-Account and Multi-Backend Brainstorm](plan/multi-account-and-backends.md).
- [Feature Brainstorm](plan/features-brainstorm.md).
- [ROI Roadmap](plan/roi-roadmap.md) — grounded, prioritized next features by impact/effort/risk.
- [Conversation Continuity and Browser Lifecycle](plan/implementation-plan-conversation-continuity.md)
  — proposed one-tab-per-session, full-history replay fallback, ~1-minute idle shutdown, and a small
  top-left headed Chrome window (refined target; the shipped idle is 5 minutes).

## Scope

Current production scope is ChatGPT Web through the bundled Responses daemon, including isolated
login, auto-start for authenticated accounts, fixed-effort model routing, lifecycle control,
settings, compaction, health/HUD, account diagnostics, admin control, account routing, and read-only
web search/fetch. Claude/Gemini, hybrid capture, native Codex tool bridging, and non-Linux artifacts are deferred
without inert production stubs.
