# adapters/chatgpt-web/conversation/canary

Mirrors `src/adapters/chatgpt-web/conversation/canary.ts`.

## Role

Defines canary data used to verify durable ChatGPT conversation continuity.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `CONVERSATION_CANARY_PROMPT` | const — Exported constant, schema, selector, or protocol marker. | 3 |
| `validateConversationCanary` | function — Callable operation exposed to its callers. | 5 |

## Behavior and invariants

- Conversation state is owner- and authority-scoped; a matching thread ID alone is not enough to reuse persisted state.
- Replay code distinguishes acknowledged history, new suffixes, compaction boundaries, and divergence so retries do not duplicate user turns.
- Persistence is bounded and atomic because the state is both security-sensitive and updated during active browser work.

## Source of truth

The implementation in `src/adapters/chatgpt-web/conversation/canary.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
