# providers/chatgpt-web/tools/mcp-server

Mirrors `src/providers/chatgpt-web/tools/mcp-server.ts`.

## Role

Exposes the turn-bound local tool bridge as an MCP server.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `runChatGptMcpServer` | function — Callable operation exposed to its callers. | 145 |

## Behavior and invariants

- Tool modules connect the browser turn to the local MCP/broker boundary without granting the browser direct access to outer process resources.
- Tool names, namespaces, results, images, and errors are preserved across the broker protocol.
- Synthetic web search is modeled as a tool/event pair so clients can render search activity consistently with other Responses items.
- Starts the MCP stdio server and forwards tool calls to the turn broker socket.
- Tool results preserve text, structured content, image/resource links, and error state.

## Related source modules

- `providers/chatgpt-web/protocol/types.ts`
- `providers/chatgpt-web/turn/environment.ts`
- `providers/chatgpt-web/turn/broker.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/tools/mcp-server.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
