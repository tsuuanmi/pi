# adapters/chatgpt-web/conversation/sync

Mirrors `src/adapters/chatgpt-web/conversation/sync.ts`.

## Role

Normalizes conversation events and computes replay, acknowledgement, and divergence state.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `CanonicalConversationEvent` | interface — Structural type contract for callers and implementers. | 3 |
| `ConversationCheckpoint` | interface — Structural type contract for callers and implementers. | 11 |
| `ConversationSuffix` | type — Union or alias used to constrain protocol data. | 19 |
| `canonicalConversationEvents` | function — Callable operation exposed to its callers. | 25 |
| `conversationPrefixDigest` | function — Callable operation exposed to its callers. | 38 |
| `conversationSuffix` | function — Callable operation exposed to its callers. | 42 |
| `acknowledgedConversationCheckpoint` | function — Callable operation exposed to its callers. | 67 |
| `isGeneratedEnvironmentMessage` | function — Callable operation exposed to its callers. | 108 |

## Behavior and invariants

- Conversation state is owner- and authority-scoped; a matching thread ID alone is not enough to reuse persisted state.
- Replay code distinguishes acknowledged history, new suffixes, compaction boundaries, and divergence so retries do not duplicate user turns.
- Persistence is bounded and atomic because the state is both security-sensitive and updated during active browser work.
- Computes the replay suffix and distinguishes retry, divergence, and new-turn cases.
- Generated environment messages are paired with their associated user message during canonicalization.

## Source of truth

The implementation in `src/adapters/chatgpt-web/conversation/sync.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
