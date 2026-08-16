# adapters/chatgpt-web/server/routes

Mirrors `src/adapters/chatgpt-web/server/routes.ts`.

## Role

Registers the ChatGPT Web loopback HTTP routes for Responses, models, health, control, and related operations.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `HttpTurnCounter` | class — Stateful component with lifecycle or coordination methods. | 40 |
| `routeChatGptWebRequest` | function — Callable operation exposed to its callers. | 156 |
| `modelsRequest` | function — Callable operation exposed to its callers. | 163 |
| `nativeSearchRequest` | function — Callable operation exposed to its callers. | 190 |
| `responseRequest` | function — Callable operation exposed to its callers. | 217 |
| `compactRequest` | function — Callable operation exposed to its callers. | 338 |
| `startServer` | function — Callable operation exposed to its callers. | 446 |

## Behavior and invariants

- The route layer owns the loopback HTTP contract and delegates provider work to the adapter/bridge.
- It tracks active HTTP work separately from active adapter work so daemon drain can prove that shutdown is safe.
- Response errors and streaming terminal events are normalized here rather than reconstructed by callers.
- Owns `/v1/responses`, `/v1/responses/compact`, `/v1/models`, native search, health, admin, and shutdown routes.
- Active HTTP and adapter counters support the daemon drain contract.

## Related source modules

- `adapters/chatgpt-web/adapter.ts`
- `adapters/chatgpt-web/browser/worker.ts`
- `adapters/chatgpt-web/conversation/journal.ts`
- `adapters/chatgpt-web/turn/broker.ts`
- `adapters/chatgpt-web/turn/execution.ts`
- `adapters/chatgpt-web/protocol/responses/bridge.ts`
- `adapters/chatgpt-web/lifecycle/config.ts`
- `core/event-queue.ts`
- `core/http-body.ts`
- `adapters/chatgpt-web/protocol/responses/errors.ts`
- `adapters/chatgpt-web/models/catalog.ts`
- `adapters/chatgpt-web/models/models.ts`
- `adapters/chatgpt-web/transport/native-passthrough.ts`
- `adapters/chatgpt-web/protocol/responses/compaction.ts`
- `adapters/chatgpt-web/protocol/responses/parser.ts`
- `adapters/chatgpt-web/protocol/responses/state.ts`
- `adapters/chatgpt-web/protocol/types.ts`
- `adapters/chatgpt-web/turn/adapter.ts`
- `adapters/chatgpt-web/transport/tunnel.ts`
- `core/server.ts`
- `core/config.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/server/routes.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
