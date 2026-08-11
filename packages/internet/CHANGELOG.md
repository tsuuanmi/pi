# Changelog

## [Unreleased]

### Added

- Scaffold the `packages/internet` package layout following the Pi package standard (so it can be
  linked into Pi): `package.json` with a `pi` manifest field, `imports` path aliases, `engines`,
  and `types`; `tsconfig.build.json`; `vitest.config.ts`; `scripts/copy-assets.mjs`; and an empty
  `src/` / `test/` tree.
- Mature `src/` structure: `core/` (backend-agnostic domain contracts ported from codex-chatgpt-web),
  `backends/openai/` (MVP — ChatGPT Web via the daemon), `backends/anthropic/` and
  `backends/google/` (future stubs), `accounts/` (multi-account registry), `tools/` (cross-backend
  tools), `hooks.ts`, `skill.ts`, `skills/codex-turn/`, and `tool/` (host + spec).
- No behavior yet.
