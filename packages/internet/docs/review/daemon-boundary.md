# Provider-Neutral Runtime Boundary Review

Status: **implemented; verification complete for the affected package**.

This review maps the former `packages/internet/vendor/codex-chatgpt-web/` snapshot to the Pi-owned
runtime at `packages/internet/vendor/runtime/`. Process isolation remains for browser containment,
but the package identity, launcher, state, source layout, and dependency direction are Pi-owned.

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
│   ├── adapters/chatgpt-web/
│   │   ├── adapter.ts
│   │   ├── config.ts
│   │   ├── control.ts
│   │   ├── doctor.ts
│   │   ├── login-state.ts
│   │   ├── server.ts
│   │   ├── setup.ts
│   │   ├── turn-adapter.ts
│   │   ├── types.ts
│   │   ├── responses/
│   │   └── browser, conversation, model, tunnel, tool, and wire modules
│   ├── cli.ts
│   ├── config.ts
│   ├── event-queue.ts
│   ├── http-body.ts
│   ├── process.ts
│   ├── server.ts
│   ├── service.ts
│   └── version.ts
└── LICENSE
```

`src/cli.ts` is the composition root. Neutral modules expose runtime-home, atomic-write,
durable-command, process/service, bounded-body/event, and HTTP-hosting primitives. They do not
import the adapter. `src/adapters/chatgpt-web/` owns every ChatGPT URL, browser selector, connector,
model, login, conversation, OpenAI Responses, and Codex-native concept.

Responses translation is adapter-owned rather than nominally neutral: its schemas, continuation
state, compaction, reasoning envelopes, errors, and SSE event names implement the OpenAI/Codex
protocol consumed by this adapter. A future adapter may reuse the neutral host and lifecycle
primitives without inheriting that protocol.

## File update matrix

### Neutral runtime

| File | Responsibility |
| --- | --- |
| `src/config.ts` | Runtime home, atomic writes, installed Bun discovery, durable command validation |
| `src/server.ts` | Provider-neutral Bun HTTP host |
| `src/service.ts` | launchd lifecycle, authenticated control requests, provider-neutral drain contract |
| `src/event-queue.ts` | Bounded async event delivery |
| `src/http-body.ts` | Bounded request decoding |
| `src/process.ts` | Process probing and checked command execution |
| `src/cli.ts` | Command parsing and adapter composition |
| `src/version.ts` | Runtime version |

### ChatGPT Web adapter

| File or area | Responsibility |
| --- | --- |
| `adapter.ts`, `turn-adapter.ts`, `types.ts` | Browser-turn contract and adapter event/domain types |
| `server.ts` | ChatGPT/OpenAI routes, health/control payloads, idle shutdown, turn dispatch |
| `responses/` | Responses parsing, projection, state, compaction, errors, and stall policy |
| `config.ts`, `setup.ts`, `doctor.ts` | ChatGPT browser/tunnel configuration and lifecycle checks |
| `browser-login.ts`, `login-state.ts`, `session.ts` | Authentication, filtered storage state, account capabilities |
| `browser-worker.ts`, `turn-*.ts`, `wire-*.ts` | Browser execution, turn authority, authenticated wire capture |
| `models.ts`, `model*.ts`, `native-passthrough.ts` | ChatGPT model routing and native backend requests |
| `conversation-*.ts`, `rolling-checkpoint.ts` | Durable ChatGPT conversation authority |
| `mcp-*.ts`, `tunnel*.ts`, `web-search/` | Adapter tools and connector transport |

### Removed

- former `vendor/codex-chatgpt-web/` package identity and snapshot metadata;
- former `#internet-vendor/*` import map and vendor wrappers;
- `codex-integration.ts`, route CLI commands, and Codex configuration mutation;
- journal/config migration and legacy connector compatibility;
- DOM answer extraction fallback when authenticated wire capture is authoritative;
- root-level provider types, Responses modules, login state, setup, diagnostics, and route server;
- old launcher/environment names and obsolete build scaffolding.

There is one runtime launcher, one state/config schema, one ChatGPT adapter, and one authoritative
implementation for each behavior.

## Parent package updates

| Area | Update |
| --- | --- |
| `package.json`, `scripts/build-daemon.mjs` | Build only `vendor/runtime` into ignored `dist/daemon/runtime` |
| `src/daemon/*` | Use the Pi-owned launcher and `PI_INTERNET_RUNTIME_HOME` |
| `src/providers/openai/daemon/*` | Consume neutral runtime health naming (`active_adapter_turns`) |
| `test/` | Use the new launcher, module paths, health payload, and state contract |
| current docs and changelog | Describe the implemented dependency boundary and breaking migration |

## Dependency and state invariants

- Neutral runtime modules never import `adapters/chatgpt-web/`; only `cli.ts` composes the adapter.
- Adapter code may depend inward on neutral runtime primitives.
- The runtime binds only to `127.0.0.1`; authenticated control routes use the current account token.
- Configuration accepts only the current explicit field set and rejects unsupported fields.
- Browser storage import remains bounded, domain-filtered, and browser-verified.
- Missing or invalid authenticated wire payloads fail the turn; no DOM response fallback exists.
- Generated runtime output is ignored and never treated as source.

## Verification matrix

- runtime: TypeScript typecheck and Bun bundle build;
- package: package build and root `tsgo --noEmit`;
- formatting/lint: Biome with warnings as errors;
- tests: Internet package Vitest suite;
- smoke: generated launcher version/startup check;
- static invariants: no former vendor path, old environment name, import alias, root provider module,
  compatibility marker, in-repository backup, or whitespace error.

## Acceptance criteria

- Runtime source has an explicit inward-only core/adapter dependency direction.
- No provider-specific identifier remains in neutral modules outside the CLI composition root.
- Legacy state is rejected deterministically and no compatibility or answer fallback remains.
- Imports, tests, configuration, current documentation, and changelog match the implemented layout.
- Build, formatter, typecheck, targeted package tests, launcher smoke, and final diff checks pass.
