# adapters/chatgpt-web/tools/web-search/synthetic-tool

Mirrors `src/adapters/chatgpt-web/tools/web-search/synthetic-tool.ts`.

## Role

Implements the synthetic web-search tool and its sidecar execution events.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `WEB_SEARCH_TOOL_NAME` | const — Exported constant, schema, selector, or protocol marker. | 4 |
| `extractHostedWebSearch` | function — Callable operation exposed to its callers. | 11 |
| `buildWebSearchTool` | function — Callable operation exposed to its callers. | 26 |

## Behavior and invariants

- Tool modules connect the browser turn to the local MCP/broker boundary without granting the browser direct access to outer process resources.
- Tool names, namespaces, results, images, and errors are preserved across the broker protocol.
- Synthetic web search is modeled as a tool/event pair so clients can render search activity consistently with other Responses items.
- Detects hosted web-search configuration and exposes a provider-neutral synthetic function tool.
- Emits begin/end activity events so Responses clients can render search progress.

## Related source modules

- `adapters/chatgpt-web/protocol/types.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/tools/web-search/synthetic-tool.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
