# providers/chatgpt-web/conversation/journal

Mirrors `src/providers/chatgpt-web/conversation/journal.ts`.

## Role

Persists and validates the durable conversation journal and its authority metadata.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ConversationStatus` | type — Union or alias used to constrain protocol data. | 21 |
| `ConversationBinding` | interface — Structural type contract for callers and implementers. | 23 |
| `ConversationJournal` | class — Stateful component with lifecycle or coordination methods. | 37 |
| `parseConversationUrl` | function — Callable operation exposed to its callers. | 170 |
| `beginDurableConversationAuthority` | function — Callable operation exposed to its callers. | 179 |
| `writeDurableConversationAuthority` | function — Callable operation exposed to its callers. | 197 |
| `conversationRuntimeDigest` | function — Callable operation exposed to its callers. | 218 |
| `conversationAccountFingerprint` | function — Callable operation exposed to its callers. | 222 |
| `assertDurableConversationAuthority` | function — Callable operation exposed to its callers. | 226 |

## Behavior and invariants

- Conversation state is owner- and authority-scoped; a matching thread ID alone is not enough to reuse persisted state.
- Replay code distinguishes acknowledged history, new suffixes, compaction boundaries, and divergence so retries do not duplicate user turns.
- Persistence is bounded and atomic because the state is both security-sensitive and updated during active browser work.
- Stores thread status, revision, conversation URL, checkpoint data, and account/runtime authority.
- Prepared, click-attempted, ready, and conflicted states prevent uncertain browser clicks from being retried silently.

## Source of truth

The implementation in `src/providers/chatgpt-web/conversation/journal.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
