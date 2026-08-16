# adapters/chatgpt-web/turn/adapter

Mirrors `src/adapters/chatgpt-web/turn/adapter.ts`.

## Role

Defines the provider adapter and incoming request metadata contracts used by the runtime host.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `IncomingMeta` | interface — Structural type contract for callers and implementers. | 4 |
| `ProviderAdapter` | interface — Structural type contract for callers and implementers. | 9 |

## Behavior and invariants

- Turn modules define the provider-neutral adapter contract and the trusted execution context around one browser turn.
- Sessions, feeds, brokers, and thread environments are bounded so a long-running daemon cannot accumulate unowned state.
- Trusted environment and identity metadata are validated before tools or browser execution can use them.

## Related source modules

- `adapters/chatgpt-web/protocol/types.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/turn/adapter.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
