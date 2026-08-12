# Changelog

## [Unreleased]

### Added

- Implement ChatGPT Web provider registration through Pi's native `openai-responses` transport,
  including canonical Sol/Luna model metadata and multiple local daemon accounts.
- Add secure daemon configuration, health, compaction, and admin control clients; account registry
  persistence; status, compact, control, and account tools; HUD status; and lifecycle hooks.
- Add focused tests for provider composition, daemon boundaries, account persistence, tools, hooks,
  and the extension entrypoint.

### Changed

- Replace the mature speculative scaffold with the smaller reviewed MVP architecture. Pi owns
  Responses streaming while the daemon owns browser automation and replay.
- Update package dependencies, exports, README, and architecture/runtime/integration documentation
  to match current public APIs and implemented behavior.

### Removed

- Remove unused Anthropic/Google stubs and custom turn adapter/replay stubs that duplicated deferred
  or host-owned responsibilities.
- Remove the unused `codex-turn` skill and its package asset-copy step.

### Fixed

- Export a working async extension factory instead of the scaffold's no-op factory.

### Historical scaffold


- Scaffold the `packages/internet` package layout following the Pi package standard (so it can be
  linked into Pi): `package.json` with a `pi` manifest field, `imports` path aliases, `engines`,
  and `types`; `tsconfig.build.json`; `vitest.config.ts`; `scripts/copy-assets.mjs`; and an empty
  `src/` / `test/` tree.
- Initial proposed `src/` structure for the package.
