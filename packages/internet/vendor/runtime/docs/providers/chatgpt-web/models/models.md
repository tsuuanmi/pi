# providers/chatgpt-web/models/models

Mirrors `src/providers/chatgpt-web/models/models.ts`.

## Role

Provides model metadata and catalog helpers used by the ChatGPT Web adapter.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `CHATGPT_WEB_MODEL_PREFIX` | const — Exported constant, schema, selector, or protocol marker. | 1 |
| `CHATGPT_WEB_BACKEND_MODEL` | const — Exported constant, schema, selector, or protocol marker. | 2 |
| `ChatGptWebBackendModel` | type — Union or alias used to constrain protocol data. | 5 |
| `ChatGptWebCodexEffort` | type — Union or alias used to constrain protocol data. | 9 |
| `ChatGptWebAdapterEffort` | type — Union or alias used to constrain protocol data. | 10 |
| `CHATGPT_WEB_INSTANT_CONTEXT_WINDOW` | const — Exported constant, schema, selector, or protocol marker. | 17 |
| `CHATGPT_WEB_INSTANT_AUTO_COMPACT_TOKEN_LIMIT` | const — Exported constant, schema, selector, or protocol marker. | 18 |
| `CHATGPT_WEB_MEDIUM_HIGH_CONTEXT_WINDOW` | const — Exported constant, schema, selector, or protocol marker. | 19 |
| `CHATGPT_WEB_MEDIUM_HIGH_AUTO_COMPACT_TOKEN_LIMIT` | const — Exported constant, schema, selector, or protocol marker. | 20 |
| `CHATGPT_WEB_INSTANT_COMPOSER_CHAR_LIMIT` | const — Exported constant, schema, selector, or protocol marker. | 21 |
| `CHATGPT_WEB_MEDIUM_HIGH_COMPOSER_CHAR_LIMIT` | const — Exported constant, schema, selector, or protocol marker. | 22 |
| `CHATGPT_WEB_PLATFORM_RESERVE_TOKENS` | const — Exported constant, schema, selector, or protocol marker. | 24 |
| `CHATGPT_WEB_PRO_AUTO_COMPACT_TOKEN_LIMIT` | const — Exported constant, schema, selector, or protocol marker. | 26 |
| `CHATGPT_WEB_PRO_STANDARD_MESSAGE_TOKEN_LIMIT` | const — Exported constant, schema, selector, or protocol marker. | 27 |
| `CHATGPT_WEB_PRO_MODEL_MESSAGE_TOKEN_LIMIT` | const — Exported constant, schema, selector, or protocol marker. | 28 |
| `CHATGPT_WEB_PRO_STANDARD_CONTEXT_WINDOW` | const — Exported constant, schema, selector, or protocol marker. | 31 |
| `CHATGPT_WEB_PRO_MODEL_CONTEXT_WINDOW` | const — Exported constant, schema, selector, or protocol marker. | 33 |
| `CHATGPT_WEB_PRO_INSTANT_COMPOSER_CHAR_LIMIT` | const — Exported constant, schema, selector, or protocol marker. | 35 |
| `CHATGPT_WEB_PRO_REASONING_COMPOSER_CHAR_LIMIT` | const — Exported constant, schema, selector, or protocol marker. | 36 |
| `CHATGPT_WEB_PRO_MODEL_COMPOSER_CHAR_LIMIT` | const — Exported constant, schema, selector, or protocol marker. | 37 |
| `ChatGptWebContextLimits` | interface — Structural type contract for callers and implementers. | 45 |
| `ChatGptWebTransportLimits` | interface — Structural type contract for callers and implementers. | 51 |
| `resolveChatGptWebContextLimits` | function — Callable operation exposed to its callers. | 70 |
| `resolveChatGptWebTransportLimits` | function — Callable operation exposed to its callers. | 107 |
| `ChatGptWebModelRoute` | interface — Structural type contract for callers and implementers. | 140 |
| `ChatGptWebAccountCapabilities` | interface — Structural type contract for callers and implementers. | 150 |
| `CHATGPT_WEB_MODEL_ROUTES` | const — Exported constant, schema, selector, or protocol marker. | 171 |
| `isChatGptWebModelSlug` | function — Callable operation exposed to its callers. | 223 |
| `availableChatGptWebModelRoutes` | function — Callable operation exposed to its callers. | 227 |
| `requireChatGptWebModelRoute` | function — Callable operation exposed to its callers. | 236 |

## Behavior and invariants

- Model metadata is the contract shared by model discovery, request routing, and capability validation.
- Static aliases and live browser/account capabilities are kept separate so unavailable models can be reported without changing their public identity.
- Model selection happens before browser execution, allowing unsupported requests to fail without opening a turn.

## Source of truth

The implementation in `src/providers/chatgpt-web/models/models.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
