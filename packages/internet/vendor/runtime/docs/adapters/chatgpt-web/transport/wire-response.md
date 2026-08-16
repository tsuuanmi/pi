# adapters/chatgpt-web/transport/wire-response

Mirrors `src/adapters/chatgpt-web/transport/wire-response.ts`.

## Role

Parses captured ChatGPT wire responses into authoritative assistant text.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `parseChatGptWireResponse` | function — Callable operation exposed to its callers. | 48 |

## Behavior and invariants

- Transport modules isolate external process/network details from the adapter and protocol layers.
- Native passthrough, tunnel management, browser wire capture, and wire parsing are separate paths with separate failure semantics.
- Credentials, keys, command lines, and captured payloads are validated or redacted at the transport boundary.
- Searches captured payloads for authoritative assistant text across nested/stream response shapes.
- Returns `undefined` when no usable assistant text is recoverable.

## Source of truth

The implementation in `src/adapters/chatgpt-web/transport/wire-response.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
