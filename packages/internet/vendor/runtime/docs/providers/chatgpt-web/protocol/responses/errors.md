# providers/chatgpt-web/protocol/responses/errors

Mirrors `src/providers/chatgpt-web/protocol/responses/errors.ts`.

## Role

Classifies adapter and upstream failures into Responses-compatible errors.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `RuntimeErrorPayload` | interface — Structural type contract for callers and implementers. | 1 |
| `isClientClosedMessage` | function — Callable operation exposed to its callers. | 67 |
| `classifyError` | function — Callable operation exposed to its callers. | 78 |
| `parseRetryAfterFromMessage` | function — Callable operation exposed to its callers. | 178 |
| `inferHttpStatusFromAdapterMessage` | function — Callable operation exposed to its callers. | 194 |
| `adapterFailureFromMessage` | function — Callable operation exposed to its callers. | 232 |
| `httpStatusFromTerminalError` | function — Callable operation exposed to its callers. | 259 |

## Behavior and invariants

- Protocol modules translate untrusted JSON and provider-neutral events at the Responses boundary.
- Schemas validate shape first; parser/state code then applies local continuation, compaction, tool, and provider-specific rules.
- Private continuation and reasoning artifacts are encoded explicitly and treated as opaque when they cannot be decoded safely.
- Normalizes status, Responses error type/code, retryability, and retry-after information.
- Recognizes client disconnects separately from provider failures.

## Source of truth

The implementation in `src/providers/chatgpt-web/protocol/responses/errors.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
