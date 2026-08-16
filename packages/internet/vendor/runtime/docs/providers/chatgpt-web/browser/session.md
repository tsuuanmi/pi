# providers/chatgpt-web/browser/session

Mirrors `src/providers/chatgpt-web/browser/session.ts`.

## Role

Defines ChatGPT browser selectors and session/authentication helpers used by the worker.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `MAX_CHATGPT_BROWSER_TABS` | const — Exported constant, schema, selector, or protocol marker. | 5 |
| `CHATGPT_HOME_URL` | const — Exported constant, schema, selector, or protocol marker. | 7 |
| `CHATGPT_COMPOSER_SELECTOR` | const — Exported constant, schema, selector, or protocol marker. | 8 |
| `CHATGPT_EFFORT_CONTROL_SELECTOR` | const — Exported constant, schema, selector, or protocol marker. | 13 |
| `CHATGPT_EFFORT_MENU_SELECTOR` | const — Exported constant, schema, selector, or protocol marker. | 17 |
| `CHATGPT_EFFORT_ITEM_SELECTOR` | const — Exported constant, schema, selector, or protocol marker. | 22 |
| `CHATGPT_EFFORT_SLIDER_SELECTOR` | const — Exported constant, schema, selector, or protocol marker. | 23 |
| `CHATGPT_EFFORT_SLIDER_MAX_OPTIONS` | const — Exported constant, schema, selector, or protocol marker. | 24 |
| `CHATGPT_STOP_BUTTON_SELECTOR` | const — Exported constant, schema, selector, or protocol marker. | 25 |
| `CHATGPT_COMPLETION_ACTION_SELECTOR` | const — Exported constant, schema, selector, or protocol marker. | 26 |
| `CHATGPT_ASSISTANT_TURN_SELECTOR` | const — Exported constant, schema, selector, or protocol marker. | 27 |
| `CHATGPT_USER_TURN_SELECTOR` | const — Exported constant, schema, selector, or protocol marker. | 32 |
| `ChatGptEffortSliderState` | interface — Structural type contract for callers and implementers. | 38 |
| `ChatGptAuthenticationSurfaceEvidence` | interface — Structural type contract for callers and implementers. | 44 |
| `chatGptAuthenticationSurfaceReady` | function — Callable operation exposed to its callers. | 49 |
| `isAuthenticatedChatGptHome` | function — Callable operation exposed to its callers. | 65 |
| `parseChatGptEffortSliderState` | function — Callable operation exposed to its callers. | 91 |
| `assertAuthenticatedChatGptPage` | function — Callable operation exposed to its callers. | 114 |
| `detectChatGptAccountCapabilities` | function — Callable operation exposed to its callers. | 123 |
| `detectChatGptProCapability` | function — Callable operation exposed to its callers. | 194 |

## Behavior and invariants

- This layer is the only module group that directly knows about ChatGPT Web DOM surfaces, selectors, tabs, and Playwright lifecycle.
- Browser state and UI evidence are validated before a turn is admitted; missing or contradictory evidence becomes a clear runtime failure.
- The worker reports protocol-neutral trace and turn events to the adapter rather than exposing Playwright objects to the HTTP layer.
- Centralizes selectors for the composer, reasoning controls, stop/completion controls, and user/assistant turns.
- Authentication is based on the expected ChatGPT surface rather than cookie presence alone.

## Related source modules

- `providers/chatgpt-web/models/models.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/browser/session.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
