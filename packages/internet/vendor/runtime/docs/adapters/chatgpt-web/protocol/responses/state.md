# adapters/chatgpt-web/protocol/responses/state

Mirrors `src/adapters/chatgpt-web/protocol/responses/state.ts`.

## Role

Maintains bounded provider-private continuation state for Responses replay.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `setResponseStateByteCapForTests` | function — Callable operation exposed to its callers. | 33 |
| `getStoredResponseBytesForTests` | function — Callable operation exposed to its callers. | 38 |
| `flushResponseState` | function — Callable operation exposed to its callers. | 161 |
| `expandPreviousResponseInput` | function — Callable operation exposed to its callers. | 191 |
| `previousResponseReplayPrefixLength` | function — Callable operation exposed to its callers. | 209 |
| `rememberResponseState` | function — Callable operation exposed to its callers. | 218 |
| `clearResponseStateMemoryForTests` | function — Callable operation exposed to its callers. | 247 |
| `clearResponseStateForTests` | function — Callable operation exposed to its callers. | 257 |

## Behavior and invariants

- Protocol modules translate untrusted JSON and provider-neutral events at the Responses boundary.
- Schemas validate shape first; parser/state code then applies local continuation, compaction, tool, and provider-specific rules.
- Private continuation and reasoning artifacts are encoded explicitly and treated as opaque when they cannot be decoded safely.
- Maintains bounded response-ID replay state and flushes it atomically.
- Replay expansion exposes only the missing prefix metadata needed by the parser and bridge.

## Related source modules

- `adapters/chatgpt-web/lifecycle/config.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/protocol/responses/state.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
