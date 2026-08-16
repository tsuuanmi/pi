# Changelog

## [Unreleased]

### Breaking Changes

- Remove `InternetHookHost` and consume Pi's `Pick<ExtensionAPI, "on" | "onHook">` contract directly.
- Replace the package-root `registerOpenAiProviders` export with generic
  `registerInternetProviders`.
- Remove the ChatGPT conversation-mode account field and require the durable conversation journal;
  existing mode-bearing account and daemon configuration must be recreated.
- Remove daemon configuration versions and external browser-launcher/CDP host support; managed
  Chrome is now the only browser host, and obsolete configurations must be recreated.
- Require canonical Sol ChatGPT Web accounts; Luna routes, rolling checkpoint state, and Luna-only
  persisted login/configuration metadata are removed and must be recreated.
- Replace the `codex-chatgpt-web` runtime identity with the Pi-owned provider-neutral `vendor/runtime`
  package; existing runtime state, journals, browser state, and old environment variables must be
  recreated.
- Rename daemon health activity from `active_browser_turns` to provider-neutral
  `active_adapter_turns`.

### Added

- Add native macOS (`x64`/`arm64`) daemon resolution, platform Chrome defaults, and Ubuntu/macOS
  package CI.
- Add verified ChatGPT/OpenAI-only browser storage-state import for daemon-owned login.
- Use authenticated ChatGPT conversation wire payloads as the sole response source; invalid or
  missing wire payloads fail the turn instead of using DOM extraction.
- Add Anthropic and Gemini API account providers using environment-referenced credentials.
- Add account removal, provider-specific validation, and automatic browser-port allocation.
- Add bounded `internet_council` orchestration with tool-free members and dependency-aware synthesis.

- Bind every Pi session to one account-scoped, owner-private ChatGPT conversation with canonical suffix synchronization.
- Own the neutral private Bun runtime inside the package and build its host-native launcher from
  `vendor/runtime`, removing the upstream package identity and manually started-daemon dependency.
- Add package-owned private config, isolated Chrome login, health-gated auto-start, serialized
  lifecycle management, graceful shutdown, and the `internet_daemon` tool.
- Implement ChatGPT Web provider registration through Pi's native `openai-responses` transport,
  including canonical Sol and capability-gated Pro model metadata and multiple local daemon accounts.
- Add secure daemon configuration, health, compaction, and admin control clients; account registry
  persistence; status, compact, control, and account tools; HUD status; and lifecycle hooks.
- Add focused tests for provider composition, daemon boundaries, account persistence, tools, hooks,
  and the extension entrypoint.
- Add keyless public web search plus bounded, SSRF-aware page fetching.
- Add private `autoLogin` settings and the `internet_settings` tool.
- Add account-scoped `internet_doctor` diagnostics backed by the bundled daemon's bounded,
  cancellable `doctor --json` command.
- Add safe workspace-local `@file` expansion and the account-scoped `internet_harness` tool for
  browser-only/Full local-tools configuration through the vendored broker/MCP runtime.
- Add `docs/usage.md` — a practical guide for `@file`, `internet_search`/`internet_fetch`, lifecycle
  tools, and the approval-gated Full-harness `codex_*` local tools.

### Changed

- Make durable ChatGPT conversations universal across browser-only and Full modes; each later turn
  reopens the saved conversation and sends only the current suffix.
- Pin all direct vendored runtime dependencies to exact lockfile versions.
- Mark Internet as optional for root Pi bundling so standard builds can omit its platform-specific runtime unless the package is built first.
- Register provider/tool control through `onHook(...)` and HUD refresh through the observation-only `turn_end` event.
- Gate registered ChatGPT Web providers through `before_provider_request` while retaining Pi's
  built-in OpenAI Responses transport for request conversion and SSE decoding.
- Move the synthesized default account into `$PI_AGENT_DIR/internet/accounts/default` and remove
  the external daemon config fallback.
- Replace the mature speculative scaffold with the smaller reviewed MVP architecture. Pi owns
  Responses streaming while the daemon owns browser automation and replay.
- Update package dependencies, exports, README, and architecture/runtime/integration documentation
  to match current public APIs and implemented behavior.
- Mirror the daemon's fixed-effort model routes, gate Pro availability, and use a conservative
  documented output ceiling.
- Publish concise provider-local model ids so model selection renders as `chatgpt-web/high` instead
  of `chatgpt-web/chatgpt-web/high`; map them to canonical daemon routes at the request boundary.
- Keep the headed daemon/browser reusable for 60 quiet seconds, use a 700×500 window at `(0,0)`, and
  keep browser/tunnel idle cleanup in the daemon instead of stopping it on every Pi session exit.
- Use one durable ChatGPT conversation for browser-only and Full harness turns; reject attachments and ambiguous, replayed, or diverged turns before another browser submit.
- Enforce the provider-neutral runtime boundary: configuration paths, process/service lifecycle,
  bounded I/O, and HTTP hosting remain in core; ChatGPT configuration, routes, Responses protocol,
  login state, setup, and diagnostics live under `vendor/runtime/src/providers/chatgpt-web/`.
- Use `Pi Internet` as the fresh connector identity.

### Removed

- Remove browser-host selectors, launcher descriptors, helper IPC, ownership handoff, and launcher
  diagnostics from the ChatGPT Web runtime.
- Remove Luna routing, rolling checkpoints, and Luna-specific context/compaction paths.
- Remove upstream Codex route mutation, route CLI commands, journal migration, and legacy connector
  compatibility paths.
- Remove the obsolete ChatGPT conversation-mode configuration and account tool.

- Remove unused Anthropic/Google stubs and custom turn adapter/replay stubs that duplicated deferred
  or host-owned responsibilities.
- Remove the unused `codex-turn` skill and its package asset-copy step.
- Remove the redundant custom internet tool host/context abstraction and stale hook context export.

### Fixed

- Load account registries without rejecting older schema version values.
- Capture every ChatGPT conversation response and select the latest message only after the browser turn completes, avoiding both premature intermediate results and brittle final-Markdown detection.
- Allow the durable conversation canary enough time to complete its browser turn, accept non-empty
  model reply variance after validating and reopening the canonical conversation URL, exclude
  request-only environment blocks from persistent history, acknowledge multi-phase assistant output
  as one response, and keep each Pi session bound to one ChatGPT conversation id across turns.
- Fix durable conversation continuation across browser-only and Full harness requests, including the
  canary model id, prompt images, and text-delta callback.
- Fix the durable conversation canary's capability metadata for tool-capable and read-only turns.
- Stop repeating the local-computer warning in browser-only ChatGPT Web prompt context while retaining
  actionable Full-harness guidance.
- Add the daemon-required stable turn identity and trusted read-only environment metadata to Pi's
  serialized ChatGPT Web requests, enabling browser-session replay across retries and tool rounds.
- Verify stored browser state independently before Pi treats an account as authenticated.
- Export a working async extension factory instead of the scaffold's no-op factory.

### Historical scaffold


- Scaffold the `packages/internet` package layout following the Pi package standard (so it can be
  linked into Pi): `package.json` with a `pi` manifest field, `imports` path aliases, `engines`,
  and `types`; `tsconfig.build.json`; `vitest.config.ts`; `scripts/copy-assets.mjs`; and an empty
  `src/` / `test/` tree.
- Initial proposed `src/` structure for the package.
