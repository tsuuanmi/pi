# providers/chatgpt-web/turn/execution

Mirrors `src/providers/chatgpt-web/turn/execution.ts`.

## Role

Tracks active ChatGPT turn sessions, trace/text feeds, execution keys, and browser outcomes.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ChatGptBrowserOutcome` | type — Union or alias used to constrain protocol data. | 11 |
| `ChatGptTraceEvent` | interface — Structural type contract for callers and implementers. | 15 |
| `ChatGptTraceFeed` | class — Stateful component with lifecycle or coordination methods. | 28 |
| `ChatGptTextFeed` | class — Stateful component with lifecycle or coordination methods. | 76 |
| `ChatGptTurnRuntime` | type — Union or alias used to constrain protocol data. | 124 |
| `chatGptTurnExecutionKey` | function — Callable operation exposed to its callers. | 148 |
| `chatGptCompactionSourceExecutionKey` | function — Callable operation exposed to its callers. | 162 |
| `ChatGptTurnSession` | class — Stateful component with lifecycle or coordination methods. | 174 |
| `ChatGptTurnSessions` | class — Stateful component with lifecycle or coordination methods. | 278 |
| `chatGptTurnSessions` | const — Exported constant, schema, selector, or protocol marker. | 362 |

## Behavior and invariants

- Turn modules define the provider-neutral adapter contract and the trusted execution context around one browser turn.
- Sessions, feeds, brokers, and thread environments are bounded so a long-running daemon cannot accumulate unowned state.
- Trusted environment and identity metadata are validated before tools or browser execution can use them.
- Feeds visible trace and final text through bounded queues.
- Execution keys identify retries/compaction sources and the shared session registry limits stale state.

## Related source modules

- `providers/chatgpt-web/protocol/types.ts`
- `providers/chatgpt-web/turn/broker.ts`
- `providers/chatgpt-web/turn/environment.ts`
- `providers/chatgpt-web/browser/session.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/turn/execution.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
