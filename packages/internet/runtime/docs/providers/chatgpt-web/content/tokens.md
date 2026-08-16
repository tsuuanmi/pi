# providers/chatgpt-web/content/tokens

Mirrors `src/providers/chatgpt-web/content/tokens.ts`.

## Role

Counts and bounds ChatGPT Web prompt/content tokens.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `estimateTokens` | function — Callable operation exposed to its callers. | 15 |
| `estimateCompiledChatGptWebMessageTokens` | function — Callable operation exposed to its callers. | 49 |
| `estimateCompiledChatGptWebInputTokens` | function — Callable operation exposed to its callers. | 56 |

## Behavior and invariants

- Content helpers translate between internal message parts and browser-facing prompt/Markdown representations.
- Images remain typed image content, while token and usage helpers make estimates explicit instead of presenting them as provider-authoritative values.
- This boundary prevents DOM/HTML conversion and prompt-size policy from spreading into protocol and route modules.

## Related source modules

- `providers/chatgpt-web/models/models.ts`
- `providers/chatgpt-web/content/prompt.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/content/tokens.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
