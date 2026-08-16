# adapters/chatgpt-web/browser/login

Mirrors `src/adapters/chatgpt-web/browser/login.ts`.

## Role

Implements interactive login, storage-state import, login verification, and browser capability checks.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `BrowserLoginResult` | interface — Structural type contract for callers and implementers. | 15 |
| `loginVerificationMarkerPath` | function — Callable operation exposed to its callers. | 30 |
| `inspectBrowserLoginCapabilities` | function — Callable operation exposed to its callers. | 90 |
| `storedBrowserLoginCapabilities` | function — Callable operation exposed to its callers. | 97 |
| `importChatGptLogin` | function — Callable operation exposed to its callers. | 112 |
| `loginToChatGpt` | function — Callable operation exposed to its callers. | 131 |
| `browserLoginStateExists` | function — Callable operation exposed to its callers. | 190 |
| `checkBrowserEngine` | function — Callable operation exposed to its callers. | 202 |

## Behavior and invariants

- This layer is the only module group that directly knows about ChatGPT Web DOM surfaces, selectors, tabs, and Playwright lifecycle.
- Browser state and UI evidence are validated before a turn is admitted; missing or contradictory evidence becomes a clear runtime failure.
- The worker reports protocol-neutral trace and turn events to the adapter rather than exposing Playwright objects to the HTTP layer.

## Related source modules

- `adapters/chatgpt-web/lifecycle/config.ts`
- `adapters/chatgpt-web/browser/session.ts`
- `adapters/chatgpt-web/models/models.ts`
- `adapters/chatgpt-web/browser/login-state.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/browser/login.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
