# providers/chatgpt-web/content/image

Mirrors `src/providers/chatgpt-web/content/image.ts`.

## Role

Parses image data URLs and related image content used at the browser boundary.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `parseDataUrl` | function — Callable operation exposed to its callers. | 5 |

## Behavior and invariants

- Content helpers translate between internal message parts and browser-facing prompt/Markdown representations.
- Images remain typed image content, while token and usage helpers make estimates explicit instead of presenting them as provider-authoritative values.
- This boundary prevents DOM/HTML conversion and prompt-size policy from spreading into protocol and route modules.

## Source of truth

The implementation in `src/providers/chatgpt-web/content/image.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
