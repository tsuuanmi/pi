# adapters/chatgpt-web/adapter-error

Mirrors `src/adapters/chatgpt-web/adapter-error.ts`.

## Role

Defines typed errors and error metadata for ChatGPT Web adapter failures.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ChatGptWebAdapterErrorOptions` | interface — Structural type contract for callers and implementers. | 1 |
| `ChatGptWebAdapterError` | class — Stateful component with lifecycle or coordination methods. | 8 |

## Behavior and invariants

- Carries structured HTTP status, error type, code, and retryability metadata so callers do not need to parse provider messages.
- Extends the standard `Error` contract while preserving the original cause when one is supplied.
- Is used at the adapter boundary for browser, broker, and protocol failures that must be classified consistently.

## Source of truth

The implementation in `src/adapters/chatgpt-web/adapter-error.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
