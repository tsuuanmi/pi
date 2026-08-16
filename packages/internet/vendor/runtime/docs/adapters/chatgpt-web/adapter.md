# adapters/chatgpt-web/adapter

Mirrors `src/adapters/chatgpt-web/adapter.ts`.

## Role

Coordinates ChatGPT Web turns, durable conversation replay, browser execution, tool brokering, and adapter event emission.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `createChatGptWebAdapter` | function — Callable operation exposed to its callers. | 252 |

## Behavior and invariants

- Converts `ParsedRequest` values into browser prompts or broker requests and translates results into `AdapterEvent` values.
- Durable continuation is admitted only after authority, runtime digest, checkpoint, and divergence checks pass.

## Related source modules

- `adapters/chatgpt-web/lifecycle/config.ts`
- `adapters/chatgpt-web/protocol/types.ts`
- `adapters/chatgpt-web/turn/adapter.ts`
- `adapters/chatgpt-web/content/image.ts`
- `adapters/chatgpt-web/adapter-error.ts`
- `adapters/chatgpt-web/browser/worker.ts`
- `adapters/chatgpt-web/conversation/journal.ts`
- `adapters/chatgpt-web/conversation/sync.ts`
- `adapters/chatgpt-web/turn/environment.ts`
- `adapters/chatgpt-web/models/model.ts`
- `adapters/chatgpt-web/content/prompt.ts`
- `adapters/chatgpt-web/turn/broker.ts`
- `adapters/chatgpt-web/turn/execution.ts`
- `adapters/chatgpt-web/content/usage.ts`
- `adapters/chatgpt-web/turn/thread-environment.ts`
- `adapters/chatgpt-web/conversation/rolling-checkpoint.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/adapter.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
