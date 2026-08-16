# providers/chatgpt-web/protocol/responses/parser

Mirrors `src/providers/chatgpt-web/protocol/responses/parser.ts`.

## Role

Parses OpenAI Responses requests into the adapter’s internal request model.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `parseRequest` | function — Callable operation exposed to its callers. | 235 |

## Behavior and invariants

- Protocol modules translate untrusted JSON and provider-neutral events at the Responses boundary.
- Schemas validate shape first; parser/state code then applies local continuation, compaction, tool, and provider-specific rules.
- Private continuation and reasoning artifacts are encoded explicitly and treated as opaque when they cannot be decoded safely.
- Validates the JSON body before producing `ParsedRequest`.
- Expands local `previous_response_id` state and extracts web-search, compaction, structured-output, and opaque-payload flags.

## Related source modules

- `providers/chatgpt-web/protocol/types.ts`
- `providers/chatgpt-web/protocol/responses/schema.ts`
- `providers/chatgpt-web/protocol/responses/compaction.ts`
- `providers/chatgpt-web/protocol/responses/state.ts`
- `providers/chatgpt-web/protocol/responses/reasoning-envelope.ts`
- `providers/chatgpt-web/tools/web-search/synthetic-tool.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/protocol/responses/parser.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
