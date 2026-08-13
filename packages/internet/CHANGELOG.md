# Changelog

## [Unreleased]

### Added

- Vendor a fixed `codex-chatgpt-web` source snapshot and build its embedded-Bun Linux runtime inside
  the package, removing the runtime dependency on another repository or manually started daemon.
- Add package-owned private config, isolated Chrome login, health-gated auto-start, serialized
  lifecycle management, graceful shutdown, and the `internet_daemon` tool.
- Implement ChatGPT Web provider registration through Pi's native `openai-responses` transport,
  including canonical Sol/Luna model metadata and multiple local daemon accounts.
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

- Gate registered ChatGPT Web providers through `before_provider_request` while retaining Pi's
  built-in OpenAI Responses transport for request conversion and SSE decoding.
- Move the synthesized default account into `$PI_AGENT_DIR/internet/accounts/default` and remove
  the external daemon config fallback.
- Replace the mature speculative scaffold with the smaller reviewed MVP architecture. Pi owns
  Responses streaming while the daemon owns browser automation and replay.
- Update package dependencies, exports, README, and architecture/runtime/integration documentation
  to match current public APIs and implemented behavior.
- Mirror the daemon's fixed-effort model routes, capability-gate Luna/Pro availability, and use a
  conservative documented output ceiling.
- Keep the headed daemon/browser reusable for five quiet minutes, use a compact 900×700 window, and
  move browser/tunnel idle cleanup into the daemon instead of stopping it on every Pi session exit.
- Document that upstream advanced to `9f74486` (a dead-code/test cleanup) and was deliberately not
  synced: the package depends on none of the removed code, and the turn-metadata, login, doctor, and
  model-catalog contracts it relies on are unchanged between v2.1.9 and `9f74486`.

### Planned (refinement, not yet implemented)

- Keep one ChatGPT conversation tab per Pi session ID so ChatGPT retains context in the chat, with
  full-history replay retained as the correctness fallback.
- Shorten the daemon idle shutdown to ~1 minute without a new request/message.
- Anchor the headed Chrome window small in the top-left quarter.
- Stop repeating the local-computer warning on browser-only turns; keep Full-harness onboarding
  discoverable via `internet_harness` status/enable and connector guidance.

### Removed

- Remove unused Anthropic/Google stubs and custom turn adapter/replay stubs that duplicated deferred
  or host-owned responsibilities.
- Remove the unused `codex-turn` skill and its package asset-copy step.
- Remove the redundant custom internet tool host/context abstraction and stale hook context export.

### Fixed

- Add the daemon-required stable turn identity and trusted read-only environment metadata to Pi's
  serialized ChatGPT Web requests, enabling browser-session replay across retries and tool rounds.
- Port the upstream v2.1.9 durable login capture flow so stored browser state is independently
  verified before Pi treats an account as authenticated.
- Export a working async extension factory instead of the scaffold's no-op factory.

### Historical scaffold


- Scaffold the `packages/internet` package layout following the Pi package standard (so it can be
  linked into Pi): `package.json` with a `pi` manifest field, `imports` path aliases, `engines`,
  and `types`; `tsconfig.build.json`; `vitest.config.ts`; `scripts/copy-assets.mjs`; and an empty
  `src/` / `test/` tree.
- Initial proposed `src/` structure for the package.
