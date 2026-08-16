# providers/chatgpt-web/protocol/responses/compaction

Mirrors `src/providers/chatgpt-web/protocol/responses/compaction.ts`.

## Role

Translates compaction requests and summaries at the Responses protocol boundary.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `BRIDGE_COMPACTION_PREFIX` | const — Exported constant, schema, selector, or protocol marker. | 18 |
| `COMPACT_PROMPT` | const — Exported constant, schema, selector, or protocol marker. | 21 |
| `SUMMARY_PREFIX` | const — Exported constant, schema, selector, or protocol marker. | 32 |
| `OPAQUE_COMPACTION_NOTE` | const — Exported constant, schema, selector, or protocol marker. | 34 |
| `isReadableCompactionSummaryText` | function — Callable operation exposed to its callers. | 37 |
| `encodeCompactionSummary` | function — Callable operation exposed to its callers. | 41 |
| `decodeCompactionSummary` | function — Callable operation exposed to its callers. | 46 |
| `compactionItemToText` | function — Callable operation exposed to its callers. | 56 |
| `isOnePixelPngDataUrl` | function — Callable operation exposed to its callers. | 86 |
| `extractCompactUserMessages` | function — Callable operation exposed to its callers. | 107 |
| `buildCompactV1Output` | function — Callable operation exposed to its callers. | 152 |

## Behavior and invariants

- Protocol modules translate untrusted JSON and provider-neutral events at the Responses boundary.
- Schemas validate shape first; parser/state code then applies local continuation, compaction, tool, and provider-specific rules.
- Private continuation and reasoning artifacts are encoded explicitly and treated as opaque when they cannot be decoded safely.
- Encodes readable compaction summaries with a private prefix and treats unknown content as opaque.
- Builds synthetic compaction output for routed adapters.

## Source of truth

The implementation in `src/providers/chatgpt-web/protocol/responses/compaction.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
