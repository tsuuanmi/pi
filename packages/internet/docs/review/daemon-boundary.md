# Provider-Neutral Runtime Boundary Review

Status: **implemented; verification complete for the affected package**.

This review maps the Pi-owned browser runtime at `packages/internet/vendor/runtime/`. Process
isolation remains for browser containment, while the source tree is organized by feature and the
core/adapter dependency direction is explicit.

The migration is intentionally breaking. Former configuration, journals, browser storage, durable
conversation state, CLI aliases, and compatibility formats are not migrated. Unsupported state
fails with a reconfiguration error and never selects a legacy path.

## Implemented layout

```text
packages/internet/vendor/runtime/
├── package.json
├── bun.lock
├── scripts/build-runtime-bundle.ts
├── src/
│   ├── cli.ts                         # sole composition root
│   ├── core/                          # provider-neutral runtime primitives
│   │   ├── config.ts
│   │   ├── event-queue.ts
│   │   ├── http-body.ts
│   │   ├── process.ts
│   │   ├── server.ts
│   │   └── service.ts
│   └── adapters/chatgpt-web/
│       ├── adapter.ts                 # adapter entrypoint
│       ├── adapter-error.ts
│       ├── browser/
│       ├── conversation/
│       ├── content/
│       ├── lifecycle/
│       ├── models/
│       ├── protocol/
│       │   ├── types.ts
│       │   └── responses/
│       ├── server/
│       ├── tools/
│       ├── transport/
│       └── turn/
└── LICENSE
```

`src/cli.ts` composes the core and ChatGPT adapter. Core modules expose runtime-home, atomic-write,
durable-command, process/service, bounded-body/event, and HTTP-hosting primitives. They never import
the adapter. The adapter owns every ChatGPT URL, browser selector, connector, model, login,
conversation, OpenAI Responses, and Codex-native concept.

## Feature ownership

| Area | Responsibility |
| --- | --- |
| `src/core/` | Neutral paths, process/service lifecycle, HTTP host, bounded I/O, runtime version |
| `adapter.ts` | ChatGPT adapter entrypoint and turn construction |
| `browser/` | Login, browser worker, filtered storage state, session, concurrency policy |
| `conversation/` | Durable conversation journal, sync, canary, rolling checkpoints |
| `content/` | Prompt, markdown, image, token, and usage conversion |
| `lifecycle/` | ChatGPT config, setup, doctor, connector identity, control |
| `models/` | Model routes, model metadata, catalog projection |
| `protocol/` | Adapter domain types and OpenAI Responses translation |
| `server/` | ChatGPT routes, health/control payloads, idle shutdown |
| `tools/` | MCP bridge and synthetic web search |
| `transport/` | Tunnel, native passthrough, authenticated wire capture |
| `turn/` | Turn contract, environment extraction, broker, and execution |

Responses translation remains adapter-owned: schemas, continuation state, compaction, reasoning
envelopes, errors, and SSE event names implement the OpenAI/Codex protocol consumed by this adapter.
A future adapter may reuse the neutral host and lifecycle primitives without inheriting that protocol.

## Removed

- former `vendor/codex-chatgpt-web/` package identity and snapshot metadata;
- former `#internet-vendor/*` import map and vendor wrappers;
- `codex-integration.ts`, route CLI commands, and Codex configuration mutation;
- journal/config migration and legacy connector compatibility;
- DOM answer extraction fallback when authenticated wire capture is authoritative;
- root-level provider types, Responses modules, login state, setup, diagnostics, and route server;
- old launcher/environment names, dead process-line writer, and obsolete build scaffolding.

There is one runtime launcher, one state/config schema, one ChatGPT adapter, and one authoritative
implementation for each behavior.

## Parent package updates

| Area | Update |
| --- | --- |
| `package.json`, `scripts/build-daemon.mjs` | Build only `vendor/runtime` into ignored `dist/daemon/runtime` |
| `src/daemon/*` | Use the Pi-owned launcher and `PI_INTERNET_RUNTIME_HOME` |
| `src/providers/openai/daemon/*` | Consume neutral runtime health naming (`active_adapter_turns`) |
| `test/` | Use feature-grouped module paths, health payload, and state contract |
| current docs and changelog | Describe the implemented feature tree and dependency boundary |

## Invariants

- Core modules never import `adapters/chatgpt-web/`; only `cli.ts` composes the adapter.
- Adapter code may depend inward on `core/` primitives.
- The runtime binds only to `127.0.0.1`; authenticated control routes use the current account token.
- Configuration accepts only the current explicit field set and rejects unsupported fields.
- Browser storage import remains bounded, domain-filtered, and browser-verified.
- Missing or invalid authenticated wire payloads fail the turn; no DOM response fallback exists.
- Every source module is reachable from `cli.ts`; generated runtime output is ignored and never source.

## Verification matrix

- runtime: TypeScript typecheck and Bun bundle build;
- package: package build and root `tsgo --noEmit`;
- formatting/lint: Biome with warnings as errors;
- tests: Internet package Vitest suite;
- smoke: generated launcher version/startup check;
- static invariants: boundary, reachability, stale-reference, link, whitespace, and backup checks.

## Acceptance criteria

- Runtime source has an explicit inward-only core/adapter dependency direction.
- Every runtime module belongs to a feature directory with one clear responsibility.
- No provider-specific identifier remains in `core/`.
- Legacy state is rejected deterministically and no compatibility or answer fallback remains.
- Imports, tests, configuration, current documentation, and changelog match the implemented layout.
- Build, formatter, typecheck, package tests, launcher smoke, and final diff checks pass.
