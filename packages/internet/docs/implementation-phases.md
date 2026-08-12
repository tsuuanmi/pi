# Internet — Implementation Phases

This records the completed architecture after reviewing current Pi, codex-chatgpt-web, and
Prometheus source. The result is Linux-first, package-owned, and intentionally MVP-scoped.

## Review corrections

- Vendor the mature daemon instead of rewriting ~15.6K lines of browser/session logic.
- Keep the vendored snapshot inside `packages/internet`; no external repo or sibling package.
- Build a self-contained platform runtime with embedded Bun under `dist/daemon/runtime/`.
- Gate only registered ChatGPT Web providers through `before_provider_request`; do not replace
  Pi's API-wide `openai-responses` stream registry.
- First authentication is interactive, but executable/config/profile/lifecycle are package-owned.
- Use a dedicated Chrome profile and loopback-only private config.
- Keep Pi's Responses transport and daemon replay ownership; do not duplicate either.
- Keep model-metadata corrections as separate work.

## Phase 0 — Existing provider/client MVP (complete)

Provider routing, account registry, daemon HTTP auth/client/status, tools, HUD, and approval hooks.

## Phase 1 — Fixed daemon snapshot (complete)

- Vendored source, pinned package manifest/lockfile, build script, license, and snapshot receipt.
- Excluded upstream launcher, tests, docs, generated artifacts, node_modules, and sync machinery.
- Runtime build validated by executing bundled `codex-chatgpt-web --version`.

## Phase 2 — Package-owned config and runtime (complete)

- Private browser-only config and control-token generation.
- Isolated storage-state/profile and broker paths per account.
- Linux/platform manifest validation and executable resolution.
- Startup health polling.

## Phase 3 — Lifecycle manager (complete)

- Serialized login/start/stop/restart per account.
- Auto-start only for authenticated enabled accounts.
- Lazy interactive login on first inference.
- Healthy existing endpoint reuse.
- Graceful admin shutdown with process-signal fallback.

## Phase 4 — Pi integration cleanup (complete)

- Provider-name-scoped readiness hook preserves Pi's built-in Responses transport.
- `internet_daemon` lifecycle tool.
- `session_shutdown` cleanup.
- Removed redundant custom tool-host/context abstraction and stale exports.

## Phase 5 — Documentation and verification (complete)

- README, architecture, runtime flow, integration, layout, changelog, and decision docs updated.
- Vendored runtime build, package build/tests, Biome, and root typecheck are release gates.

## Deferred

- Model metadata correction documented in `review/implementation-review.md`.
- Prometheus-inspired hybrid network capture with DOM fallback.
- Runtime artifacts for non-Linux platforms/architectures.
- Web search/fetch, native Codex tool bridge, and additional backends.
