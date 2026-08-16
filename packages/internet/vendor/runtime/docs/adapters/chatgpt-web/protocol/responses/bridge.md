# adapters/chatgpt-web/protocol/responses/bridge

Mirrors `src/adapters/chatgpt-web/protocol/responses/bridge.ts`.

## Role

Bridges adapter events into OpenAI Responses streaming events and batches non-streaming output.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `adapterFailureFromMessage` | re-export — API re-exported from a neighboring module. | 67 |
| `ResponsesTerminalStatus` | type — Union or alias used to constrain protocol data. | 86 |
| `bridgeToResponsesSSE` | function — Callable operation exposed to its callers. | 88 |
| `buildResponseJSON` | function — Callable operation exposed to its callers. | 905 |
| `formatErrorResponse` | function — Callable operation exposed to its callers. | 1161 |

## Behavior and invariants

- Protocol modules translate untrusted JSON and provider-neutral events at the Responses boundary.
- Schemas validate shape first; parser/state code then applies local continuation, compaction, tool, and provider-specific rules.
- Private continuation and reasoning artifacts are encoded explicitly and treated as opaque when they cannot be decoded safely.
- Maintains output indexes and item lifecycle events for reasoning, tools, citations, and web-search activity.
- Supports streaming SSE and non-streaming JSON while preserving terminal continuation state.

## Related source modules

- `adapters/chatgpt-web/protocol/types.ts`
- `adapters/chatgpt-web/protocol/responses/errors.ts`
- `adapters/chatgpt-web/protocol/responses/compaction.ts`
- `adapters/chatgpt-web/protocol/responses/reasoning-envelope.ts`
- `adapters/chatgpt-web/content/usage.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/protocol/responses/bridge.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
