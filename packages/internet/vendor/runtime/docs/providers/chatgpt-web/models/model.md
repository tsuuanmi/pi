# providers/chatgpt-web/models/model

Mirrors `src/providers/chatgpt-web/models/model.ts`.

## Role

Resolves ChatGPT Web model modes, capabilities, reasoning settings, and model identifiers.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `CHATGPT_WEB_MODEL_ID` | const — Exported constant, schema, selector, or protocol marker. | 3 |
| `ChatGptWebCapabilities` | interface — Structural type contract for callers and implementers. | 5 |
| `ChatGptWebModelMode` | interface — Structural type contract for callers and implementers. | 10 |
| `resolveChatGptWebModelMode` | function — Callable operation exposed to its callers. | 18 |

## Behavior and invariants

- Model metadata is the contract shared by model discovery, request routing, and capability validation.
- Static aliases and live browser/account capabilities are kept separate so unavailable models can be reported without changing their public identity.
- Model selection happens before browser execution, allowing unsupported requests to fail without opening a turn.

## Related source modules

- `providers/chatgpt-web/models/models.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/models/model.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
