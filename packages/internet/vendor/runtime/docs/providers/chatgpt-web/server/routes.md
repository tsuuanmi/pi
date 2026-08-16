# providers/chatgpt-web/server/routes

Mirrors `src/providers/chatgpt-web/server/routes.ts`.

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

- `providers/chatgpt-web/adapter.ts`
- `browser/chatgpt-web/worker.ts`
- `providers/chatgpt-web/conversation/journal.ts`
- `providers/chatgpt-web/turn/broker.ts`
- `providers/chatgpt-web/turn/execution.ts`
- `providers/chatgpt-web/protocol/responses/bridge.ts`
- `providers/chatgpt-web/lifecycle/config.ts`
- `core/event-queue.ts`
- `core/http-body.ts`
- `providers/chatgpt-web/protocol/responses/errors.ts`
- `providers/chatgpt-web/models/catalog.ts`
- `providers/chatgpt-web/models/models.ts`
- `providers/chatgpt-web/transport/native-passthrough.ts`
- `providers/chatgpt-web/protocol/responses/compaction.ts`
- `providers/chatgpt-web/protocol/responses/parser.ts`
- `providers/chatgpt-web/protocol/responses/state.ts`
- `providers/chatgpt-web/protocol/types.ts`
- `providers/chatgpt-web/turn/adapter.ts`
- `providers/chatgpt-web/transport/tunnel.ts`
- `core/server.ts`
- `core/config.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/server/routes.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
