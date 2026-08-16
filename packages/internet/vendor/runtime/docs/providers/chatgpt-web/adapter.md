# providers/chatgpt-web/adapter

Mirrors `src/providers/chatgpt-web/adapter.ts`.

## Role

Coordinates ChatGPT Web turns, durable conversation replay, browser execution, tool brokering, and adapter event emission.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `createChatGptWebAdapter` | function — Callable operation exposed to its callers. | 252 |

## Behavior and invariants

- Converts `ParsedRequest` values into browser prompts or broker requests and translates results into `AdapterEvent` values.
- Durable continuation is admitted only after authority, runtime digest, journal checkpoint, and divergence checks pass.

## Related source modules

- `providers/chatgpt-web/lifecycle/config.ts`
- `providers/chatgpt-web/protocol/types.ts`
- `providers/chatgpt-web/turn/adapter.ts`
- `providers/chatgpt-web/content/image.ts`
- `providers/chatgpt-web/adapter-error.ts`
- `providers/chatgpt-web/browser/worker.ts`
- `providers/chatgpt-web/conversation/journal.ts`
- `providers/chatgpt-web/conversation/sync.ts`
- `providers/chatgpt-web/turn/environment.ts`
- `providers/chatgpt-web/models/model.ts`
- `providers/chatgpt-web/content/prompt.ts`
- `providers/chatgpt-web/turn/broker.ts`
- `providers/chatgpt-web/turn/execution.ts`
- `providers/chatgpt-web/content/usage.ts`
- `providers/chatgpt-web/turn/thread-environment.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/adapter.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
