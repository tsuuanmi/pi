# core/config

Mirrors `src/core/config.ts`.

## Role

Defines the strict ChatGPT Web/Gemini Web runtime configuration union, secure atomic file writes,
executable discovery, and durable command validation.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `VERSION` | const — Exported constant, schema, selector, or protocol marker. | 5 |
| `RuntimeServiceConfig` | interface — Structural type contract for callers and implementers. | 7 |
| `expandUserPath` | function — Callable operation exposed to its callers. | 14 |
| `getConfigDir` | function — Callable operation exposed to its callers. | 20 |
| `getConfigPath` | function — Callable operation exposed to its callers. | 25 |
| `atomicWriteFile` | function — Callable operation exposed to its callers. | 48 |
| `currentRuntimeCommand` | function — Callable operation exposed to its callers. | 66 |
| `installedBunExecutable` | function — Callable operation exposed to its callers. | 79 |
| `runtimeCommandForProcess` | function — Callable operation exposed to its callers. | 115 |
| `assertDurableRuntimeCommand` | function — Callable operation exposed to its callers. | 154 |

## Behavior and invariants

- `loadRuntimeConfig()` dispatches by the explicit `adapter` discriminator. Gemini accepts only
  browser-only loopback fields and rejects tunnel, broker, MCP, and ChatGPT capability fields.
- `parseGeminiWebRuntimeConfig()` validates required strings, absolute private paths, browser window
  settings, control token, runtime command, context limit, and port before returning the union member.
- These provider-neutral primitives are used by the runtime entrypoint and adapter host; they do not contain provider-specific protocol logic.
- Failures are explicit and synchronous/asynchronous according to the underlying operation, so callers can surface them at the CLI or HTTP boundary.
- Paths, process commands, and service state are treated as security-sensitive inputs and are validated before they are persisted or launched.

## Source of truth

The implementation in `src/core/config.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
