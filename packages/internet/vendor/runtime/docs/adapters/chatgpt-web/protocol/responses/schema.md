# adapters/chatgpt-web/protocol/responses/schema

Mirrors `src/adapters/chatgpt-web/protocol/responses/schema.ts`.

## Role

Defines runtime validation schemas for Responses requests, events, and output items.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `inputItemSchema` | const — Exported constant, schema, selector, or protocol marker. | 98 |
| `toolSchema` | const — Exported constant, schema, selector, or protocol marker. | 111 |
| `toolChoiceSchema` | const — Exported constant, schema, selector, or protocol marker. | 128 |
| `reasoningConfigSchema` | const — Exported constant, schema, selector, or protocol marker. | 138 |
| `stopSchema` | const — Exported constant, schema, selector, or protocol marker. | 143 |
| `responsesRequestSchema` | const — Exported constant, schema, selector, or protocol marker. | 145 |

## Behavior and invariants

- Protocol modules translate untrusted JSON and provider-neutral events at the Responses boundary.
- Schemas validate shape first; parser/state code then applies local continuation, compaction, tool, and provider-specific rules.
- Private continuation and reasoning artifacts are encoded explicitly and treated as opaque when they cannot be decoded safely.

## Source of truth

The implementation in `src/adapters/chatgpt-web/protocol/responses/schema.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
