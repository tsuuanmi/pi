# Pi-owned Provider Runtime

Status: **implemented; breaking migration complete**.

## Decision

The former `codex-chatgpt-web` source is now the neutral `packages/internet/vendor/runtime/`
package. Its `src/core/` contains provider-agnostic runtime code, while Codex- and ChatGPT-specific
behavior is organized by feature under `src/adapters/chatgpt-web/`. The existing daemon process boundary remains, but
Pi owns the source, configuration, lifecycle, build, tests, and public contract.

The migration is intentionally breaking. Existing `codex-chatgpt-web` state is not migrated.
Legacy configuration files, integration journals, browser storage, durable conversation state,
upstream CLI aliases, and vendor-specific APIs are invalid after migration. Users must configure a
new Pi account and daemon.

## Target ownership

| Responsibility | Target boundary |
| --- | --- |
| Account identity and paths | Parent Pi account registry and neutral runtime config contract |
| Provider registration | `src/providers/openai/provider.ts` and model routes |
| Generic daemon lifecycle | `vendor/runtime/src/core/` modules and daemon manager |
| ChatGPT browser sessions and turns | `vendor/runtime/src/adapters/chatgpt-web/` |
| OpenAI/Codex Responses translation | ChatGPT adapter `protocol/responses/` modules |
| Generic HTTP hosting, events, process, and bounded body I/O | `vendor/runtime/src/core/` |
| MCP/tool execution | ChatGPT adapter modules |
| Process/service lifecycle | Neutral runtime; ChatGPT health/control routes remain adapter-owned |
| Runtime packaging | `scripts/build-daemon.mjs` and package build output |
| Behavioral coverage | `packages/internet/test/`, mirroring source modules |

The parent extension must depend only on Pi-owned interfaces. No source import may use the old
vendor alias or an upstream package-private module.

## Structural rules

- Keep one implementation for each browser, protocol, state, and control responsibility.
- Keep pure parsing and validation independent from filesystem, browser, process, and network I/O.
- Keep account configuration separate from daemon execution.
- Keep browser page selectors and wire details behind browser-facing interfaces.
- Keep Responses event projection independent from HTTP server lifecycle.
- Keep the provider registration surface thin and model-oriented.
- Use explicit feature directories such as `core`, `browser`, `conversation`, `content`,
  `lifecycle`, `models`, `protocol`, `tools`, `transport`, and `turn`; do not retain upstream names
  that describe obsolete package boundaries.
- Prefer the existing Pi error, account, daemon, and route types over duplicate vendor types.

## Removal policy

The implementation must delete rather than wrap or alias the old design:

- the former `vendor/codex-chatgpt-web` directory name and its private package metadata;
- the `#internet-vendor/*` import map;
- upstream CLI and Codex route-management contracts not used by Pi;
- journal-version migration and legacy configuration parsing;
- compatibility fallbacks for unsupported Codex input shapes;
- duplicate provider, runtime, state, and error definitions;
- obsolete snapshot/build handoff code and documentation.

A behavior may remain only when it is required by the current Pi provider contract and covered by a
focused test. Unsupported legacy state must fail with a clear reconfiguration error, not silently
fall back to an older path.

## Implementation result

The implementation completed the planned breaking migration:

1. The runtime directory is `vendor/runtime/` and its launcher is `pi-internet-runtime`.
2. ChatGPT/Codex-specific configuration, setup, diagnostics, routes, Responses translation, types,
   browser, login, model, tunnel, native passthrough, image, and search files live under
   `src/adapters/chatgpt-web/`.
3. `codex-integration.ts`, upstream route mutation, route CLI commands, and legacy journal handling
   were removed.
4. Parent build scripts, package imports, daemon environment variables, launcher fixtures, tests,
   and current documentation use the neutral runtime identity.
5. The isolated Bun runtime boundary remains unchanged as a reliability boundary.

## Acceptance result

- No production import references the old `vendor/codex-chatgpt-web` path or `#internet-vendor/*`.
- The neutral runtime package builds as `vendor/runtime` with no upstream package identity.
- Provider-specific moved modules are confined to `vendor/runtime/src/adapters/chatgpt-web/`.
- Unsupported legacy state is not migrated implicitly.
- The runtime typecheck/build, root typecheck, and full Internet package test suite pass.
