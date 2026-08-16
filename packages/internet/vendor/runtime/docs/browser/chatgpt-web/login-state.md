# browser/chatgpt-web/login-state

Mirrors `src/browser/chatgpt-web/login-state.ts`.

## Role

Validates, sanitizes, and reads persisted ChatGPT/OpenAI browser storage state.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ChatGptStorageCookie` | interface — Structural type contract for callers and implementers. | 8 |
| `ChatGptStorageOrigin` | interface — Structural type contract for callers and implementers. | 20 |
| `ChatGptStorageState` | interface — Structural type contract for callers and implementers. | 25 |
| `sanitizeChatGptStorageState` | function — Callable operation exposed to its callers. | 85 |
| `readChatGptStorageState` | function — Callable operation exposed to its callers. | 95 |

## Behavior and invariants

- Storage-state validation has no Playwright lifecycle or DOM responsibility.
- Only HTTPS ChatGPT/OpenAI origins and allowed-domain cookies survive sanitization.
- Rejects symlinks, non-regular files, malformed state, and files larger than 10 MiB.

## Source of truth

The implementation in `src/browser/chatgpt-web/login-state.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
