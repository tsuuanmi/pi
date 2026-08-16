# providers/chatgpt-web/turn/broker

Mirrors `src/providers/chatgpt-web/turn/broker.ts`.

## Role

Provides the local turn broker that coordinates browser turns and MCP/tool invocations.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `BrokerToolRequest` | interface — Structural type contract for callers and implementers. | 12 |
| `BrokerToolResult` | interface — Structural type contract for callers and implementers. | 20 |
| `closeTurnBrokers` | function — Callable operation exposed to its callers. | 71 |
| `TurnBroker` | class — Stateful component with lifecycle or coordination methods. | 103 |
| `callTurnBroker` | function — Callable operation exposed to its callers. | 506 |

## Behavior and invariants

- Turn modules define the provider-neutral adapter contract and the trusted execution context around one browser turn.
- Sessions, feeds, brokers, and thread environments are bounded so a long-running daemon cannot accumulate unowned state.
- Trusted environment and identity metadata are validated before tools or browser execution can use them.
- Correlates broker request/response IDs over Unix-socket or named-pipe channels.
- Pending requests are cancellable and line-size/transport failures reject calls rather than hanging turns.

## Related source modules

- `providers/chatgpt-web/lifecycle/config.ts`
- `providers/chatgpt-web/turn/environment.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/turn/broker.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
