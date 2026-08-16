# core/http-body

Mirrors `src/core/http-body.ts`.

## Role

Reads JSON request bodies while enforcing encoded and decoded size limits.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `readJsonRequestBody` | function — Callable operation exposed to its callers. | 8 |

## Behavior and invariants

- These provider-neutral primitives are used by the runtime entrypoint and adapter host; they do not contain ChatGPT-specific protocol logic.
- Failures are explicit and synchronous/asynchronous according to the underlying operation, so callers can surface them at the CLI or HTTP boundary.
- Paths, process commands, and service state are treated as security-sensitive inputs and are validated before they are persisted or launched.
- Accepts identity and `zstd` encoding only, with 64 MiB encoded and 128 MiB decoded limits.
- Uses fatal UTF-8 decoding and JSON parsing before route-specific validation.

## Source of truth

The implementation in `src/core/http-body.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
