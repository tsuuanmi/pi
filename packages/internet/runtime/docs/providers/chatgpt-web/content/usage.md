# providers/chatgpt-web/content/usage

Mirrors `src/providers/chatgpt-web/content/usage.ts`.

## Role

Estimates token usage for ChatGPT Web browser turns.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ChatGptWebRoundEvidence` | interface — Structural type contract for callers and implementers. | 12 |
| `usageDisplayTotalTokens` | function — Callable operation exposed to its callers. | 18 |
| `estimateChatGptWebInputTokens` | function — Callable operation exposed to its callers. | 29 |
| `estimateChatGptWebUsage` | function — Callable operation exposed to its callers. | 64 |

## Behavior and invariants

- Content helpers translate between internal message parts and browser-facing prompt/Markdown representations.
- Images remain typed image content, while token and usage helpers make estimates explicit instead of presenting them as provider-authoritative values.
- This boundary prevents DOM/HTML conversion and prompt-size policy from spreading into protocol and route modules.
- Produces best-effort input/output/total accounting and marks browser-derived values as estimates.
- It does not replace provider-authoritative usage when that usage is available.

## Related source modules

- `providers/chatgpt-web/protocol/types.ts`
- `providers/chatgpt-web/content/tokens.ts`
- `providers/chatgpt-web/content/prompt.ts`
- `providers/chatgpt-web/turn/environment.ts`
- `providers/chatgpt-web/models/model.ts`
- `providers/chatgpt-web/turn/broker.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/content/usage.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
