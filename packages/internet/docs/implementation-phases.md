# Internet — Implementation Phases

This document records the reviewed implementation order for `@tsuuanmi/pi-internet`. The MVP is
implemented; future phases remain deliberately unscaffolded until their contracts are concrete.

## Review corrections

The original scaffold plan was compared with the current Pi and daemon source before implementation.
The review established these authoritative decisions:

- Pi tools use `parameters` and the five-argument `ContextToolSpec.execute` signature.
- Provider inference uses Pi's native `openai-responses` handler; there is no package SSE adapter.
- The daemon owns browser-turn replay/dedup; there is no package replay cache.
- Daemon host/port/control token come from private `config.json`, not `runtime.json`.
- Current daemon model ids are `chatgpt-web/high` (Sol) and `chatgpt-web/luna`.
- Anthropic/Google and native-tool bridge files are deferred, not empty production stubs.

## Phase 0 — Package contracts (complete)

- Public exports and `VERSION`.
- Typed errors and account/tool domain contracts.
- Narrow `InternetToolHost` / `InternetToolSpec` boundary.
- Dependencies aligned with the monorepo's pinned public packages.

**Gate:** package build and core type tests.

## Phase 1 — Provider routing (complete)

- Canonical Sol/Luna model metadata.
- Account-scoped `openai-responses` provider configs.
- One canonical `chatgpt-web` provider for a single account; account-suffixed names for multiple
  accounts.
- Loopback placeholder API key with `authHeader: false`.

**Gate:** model, provider, and extension-composition tests.

## Phase 2 — Secure daemon client (complete)

- Private `config.json` parsing with loopback validation.
- Health, compact, and admin control HTTP calls.
- Bearer token only for `/admin/*` routes.
- Typed unreachable/rejected errors and request timeouts.
- Non-throwing HUD status projection.

**Gate:** auth, route, client, and status tests.

## Phase 3 — Account registry (complete)

- Atomic `0600` registry persistence under `$PI_AGENT_DIR/internet/`.
- Validated add/list/get/enable operations.
- Synthesized default account from daemon config or the documented loopback endpoint.
- Account-aware daemon tools; provider changes activate after Pi reload.

**Gate:** registry and account-tool tests.

## Phase 4 — Tool surface (complete)

- `internet_status`
- `internet_compact` with Luna guard
- `internet_control`
- `internet_accounts`
- `internet_account_add`
- `internet_account_set_enabled`

**Gate:** all tool tests and full package suite.

## Phase 5 — Extension lifecycle (complete)

- Async extension factory registers providers, tools, hooks, and HUD.
- `turn_end` refreshes HUD.
- Future bridged `codex_*` tool names are fail-closed and require interactive confirmation.

**Gate:** hooks test, extension-composition test, package build.

## Phase 6 — Hardening (complete)

- Normative docs and changelog match implemented behavior.
- Obsolete scaffold files and exports removed.
- Biome, package build, package suite, and root typecheck pass.

## Future phases (not implemented)

Add only when each phase has concrete daemon/API contracts and matching tests:

1. Daemon lifecycle commands (explicitly configured start/stop/doctor).
2. Web search/fetch tools.
3. Native Codex tool bridge and per-turn binding lifecycle.
4. Additional browser backends such as Anthropic or Google.

No future phase should duplicate Pi's provider transport or the daemon's browser/session ownership.
