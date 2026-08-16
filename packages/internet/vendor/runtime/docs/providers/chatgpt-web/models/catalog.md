# providers/chatgpt-web/models/catalog

Mirrors `src/providers/chatgpt-web/models/catalog.ts`.

## Role

Defines the ChatGPT Web model catalog and projects live/configured model capabilities.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `CHATGPT_WEB_MODEL_PRIORITY` | const — Exported constant, schema, selector, or protocol marker. | 12 |
| `buildChatGptWebModel` | function — Callable operation exposed to its callers. | 65 |
| `augmentNativeModelCatalog` | function — Callable operation exposed to its callers. | 115 |

## Behavior and invariants

- Model metadata is the contract shared by model discovery, request routing, and capability validation.
- Static aliases and live browser/account capabilities are kept separate so unavailable models can be reported without changing their public identity.
- Model selection happens before browser execution, allowing unsupported requests to fail without opening a turn.
- Projects configured metadata and authenticated browser capabilities into `/v1/models` entries.
- Entries carry context windows, modalities, reasoning efforts, and defaults.

## Related source modules

- `providers/chatgpt-web/lifecycle/config.ts`
- `providers/chatgpt-web/models/models.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/models/catalog.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
