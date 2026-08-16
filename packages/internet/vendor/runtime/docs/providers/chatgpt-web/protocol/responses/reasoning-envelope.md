# providers/chatgpt-web/protocol/responses/reasoning-envelope

Mirrors `src/providers/chatgpt-web/protocol/responses/reasoning-envelope.ts`.

## Role

Encodes and decodes the reasoning metadata preserved across Responses turns.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `BRIDGE_REASONING_PREFIX` | const — Exported constant, schema, selector, or protocol marker. | 12 |
| `ReasoningEnvelope` | interface — Structural type contract for callers and implementers. | 14 |
| `encodeReasoningEnvelope` | function — Callable operation exposed to its callers. | 26 |
| `decodeReasoningEnvelope` | function — Callable operation exposed to its callers. | 31 |

## Behavior and invariants

- Protocol modules translate untrusted JSON and provider-neutral events at the Responses boundary.
- Schemas validate shape first; parser/state code then applies local continuation, compaction, tool, and provider-specific rules.
- Private continuation and reasoning artifacts are encoded explicitly and treated as opaque when they cannot be decoded safely.

## Source of truth

The implementation in `src/providers/chatgpt-web/protocol/responses/reasoning-envelope.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
