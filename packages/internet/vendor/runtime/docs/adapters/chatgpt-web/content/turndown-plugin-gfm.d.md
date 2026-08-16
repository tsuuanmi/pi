# adapters/chatgpt-web/content/turndown-plugin-gfm.d

Mirrors `src/adapters/chatgpt-web/content/turndown-plugin-gfm.d.ts`.

## Role

Declares the TypeScript surface for the vendored Turndown GitHub-Flavored Markdown plugin.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `gfm` | const — Exported constant, schema, selector, or protocol marker. | 4 |

## Behavior and invariants

- Content helpers translate between internal message parts and browser-facing prompt/Markdown representations.
- Images remain typed image content, while token and usage helpers make estimates explicit instead of presenting them as provider-authoritative values.
- This boundary prevents DOM/HTML conversion and prompt-size policy from spreading into protocol and route modules.

## Source of truth

The implementation in `src/adapters/chatgpt-web/content/turndown-plugin-gfm.d.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
