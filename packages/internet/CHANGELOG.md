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

### Changed

- Gate registered ChatGPT Web providers through `before_provider_request` while retaining Pi's
  built-in OpenAI Responses transport for request conversion and SSE decoding.
- Move the synthesized default account into `$PI_AGENT_DIR/internet/accounts/default` and remove
  the external daemon config fallback.
- Replace the mature speculative scaffold with the smaller reviewed MVP architecture. Pi owns
  Responses streaming while the daemon owns browser automation and replay.
- Update package dependencies, exports, README, and architecture/runtime/integration documentation
  to match current public APIs and implemented behavior.

### Removed

- Remove unused Anthropic/Google stubs and custom turn adapter/replay stubs that duplicated deferred
  or host-owned responsibilities.
- Remove the unused `codex-turn` skill and its package asset-copy step.
- Remove the redundant custom internet tool host/context abstraction and stale hook context export.

### Fixed

- Export a working async extension factory instead of the scaffold's no-op factory.

### Historical scaffold


- Scaffold the `packages/internet` package layout following the Pi package standard (so it can be
  linked into Pi): `package.json` with a `pi` manifest field, `imports` path aliases, `engines`,
  and `types`; `tsconfig.build.json`; `vitest.config.ts`; `scripts/copy-assets.mjs`; and an empty
  `src/` / `test/` tree.
- Initial proposed `src/` structure for the package.
