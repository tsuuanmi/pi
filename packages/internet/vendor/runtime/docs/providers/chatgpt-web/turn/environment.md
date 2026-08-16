# providers/chatgpt-web/turn/environment

Mirrors `src/providers/chatgpt-web/turn/environment.ts`.

## Role

Extracts and validates trusted task environment, sandbox, identity, and revision metadata.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ChatGptSandboxPolicy` | type — Union or alias used to constrain protocol data. | 5 |
| `ChatGptTurnEnvironment` | interface — Structural type contract for callers and implementers. | 10 |
| `ChatGptTurnIdentity` | interface — Structural type contract for callers and implementers. | 18 |
| `ChatGptTurnUserRevision` | interface — Structural type contract for callers and implementers. | 24 |
| `MissingTrustedCodexEnvironmentError` | class — Stateful component with lifecycle or coordination methods. | 29 |
| `extractChatGptTurnUserRevision` | function — Callable operation exposed to its callers. | 92 |
| `extractChatGptCompactionSourceRevision` | function — Callable operation exposed to its callers. | 119 |
| `extractChatGptTurnEnvironment` | function — Callable operation exposed to its callers. | 386 |
| `extractChatGptTurnIdentity` | function — Callable operation exposed to its callers. | 422 |

## Behavior and invariants

- Turn modules define the provider-neutral adapter contract and the trusted execution context around one browser turn.
- Sessions, feeds, brokers, and thread environments are bounded so a long-running daemon cannot accumulate unowned state.
- Trusted environment and identity metadata are validated before tools or browser execution can use them.
- Extracts trusted working directory, writable roots, sandbox policy, turn identity, and user revision.
- Missing or conflicting authority is a distinct failure before browser tools execute.

## Related source modules

- `providers/chatgpt-web/protocol/responses/compaction.ts`
- `providers/chatgpt-web/protocol/types.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/turn/environment.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
