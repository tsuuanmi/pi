# adapters/chatgpt-web/content/markdown

Mirrors `src/adapters/chatgpt-web/content/markdown.ts`.

## Role

Converts ChatGPT Web content into the Markdown representation returned by the adapter.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `chatGptHtmlToMarkdown` | function — Callable operation exposed to its callers. | 40 |
| `ChatGptMarkdownSegment` | interface — Structural type contract for callers and implementers. | 44 |
| `ChatGptMarkdownBuffer` | class — Stateful component with lifecycle or coordination methods. | 71 |

## Behavior and invariants

- Content helpers translate between internal message parts and browser-facing prompt/Markdown representations.
- Images remain typed image content, while token and usage helpers make estimates explicit instead of presenting them as provider-authoritative values.
- This boundary prevents DOM/HTML conversion and prompt-size policy from spreading into protocol and route modules.

## Source of truth

The implementation in `src/adapters/chatgpt-web/content/markdown.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
