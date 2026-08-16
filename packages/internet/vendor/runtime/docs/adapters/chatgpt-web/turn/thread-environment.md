# adapters/chatgpt-web/turn/thread-environment

Mirrors `src/adapters/chatgpt-web/turn/thread-environment.ts`.

## Role

Persists bounded trusted thread environments for follow-up turns that omit the original envelope.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ChatGptThreadEnvironmentStore` | class — Stateful component with lifecycle or coordination methods. | 115 |

## Behavior and invariants

- Turn modules define the provider-neutral adapter contract and the trusted execution context around one browser turn.
- Sessions, feeds, brokers, and thread environments are bounded so a long-running daemon cannot accumulate unowned state.
- Trusted environment and identity metadata are validated before tools or browser execution can use them.
- Stores bounded trusted thread environments with retention and path normalization.
- Reuse is not an authority bypass; current request metadata must still match the stored thread record.

## Related source modules

- `adapters/chatgpt-web/lifecycle/config.ts`
- `adapters/chatgpt-web/protocol/types.ts`
- `adapters/chatgpt-web/turn/environment.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/turn/thread-environment.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
