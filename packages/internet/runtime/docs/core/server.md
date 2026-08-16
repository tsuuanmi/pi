# core/server

Mirrors `src/core/server.ts`.

## Role

Starts the provider-neutral Bun HTTP host and delegates request handling to an adapter.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `HttpServerOptions` | interface — Structural type contract for callers and implementers. | 1 |
| `startHttpServer` | function — Callable operation exposed to its callers. | 8 |

## Behavior and invariants

- These provider-neutral primitives are used by the runtime entrypoint and adapter host; they do not contain ChatGPT-specific protocol logic.
- Failures are explicit and synchronous/asynchronous according to the underlying operation, so callers can surface them at the CLI or HTTP boundary.
- Paths, process commands, and service state are treated as security-sensitive inputs and are validated before they are persisted or launched.

## Source of truth

The implementation in `src/core/server.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
