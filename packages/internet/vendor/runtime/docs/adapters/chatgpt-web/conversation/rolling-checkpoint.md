# adapters/chatgpt-web/conversation/rolling-checkpoint

Mirrors `src/adapters/chatgpt-web/conversation/rolling-checkpoint.ts`.

## Role

Stores and validates exact-parent rolling checkpoints for Luna/free conversation turns.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `CHATGPT_LUNA_CHECKPOINT_MARKER` | const — Exported constant, schema, selector, or protocol marker. | 11 |
| `CHATGPT_LUNA_CHECKPOINT_MAX_TOKENS` | const — Exported constant, schema, selector, or protocol marker. | 12 |
| `ChatGptLunaCheckpoint` | type — Union or alias used to constrain protocol data. | 20 |
| `CapturedChatGptLunaCheckpoint` | interface — Structural type contract for callers and implementers. | 22 |
| `hashChatGptLunaAnswer` | function — Callable operation exposed to its callers. | 61 |
| `parseChatGptLunaCheckpoint` | function — Callable operation exposed to its callers. | 65 |
| `ChatGptLunaCheckpointStream` | class — Stateful component with lifecycle or coordination methods. | 88 |
| `ChatGptLunaCheckpointStore` | class — Stateful component with lifecycle or coordination methods. | 233 |

## Behavior and invariants

- Conversation state is owner- and authority-scoped; a matching thread ID alone is not enough to reuse persisted state.
- Replay code distinguishes acknowledged history, new suffixes, compaction boundaries, and divergence so retries do not duplicate user turns.
- Persistence is bounded and atomic because the state is both security-sensitive and updated during active browser work.

## Related source modules

- `adapters/chatgpt-web/lifecycle/config.ts`
- `adapters/chatgpt-web/content/tokens.ts`
- `adapters/chatgpt-web/protocol/responses/parser.ts`
- `adapters/chatgpt-web/protocol/types.ts`
- `adapters/chatgpt-web/turn/environment.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/conversation/rolling-checkpoint.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
