# browser/chatgpt-web/interactions

Mirrors `src/browser/chatgpt-web/interactions.ts`.

## Role

Owns ChatGPT composer interaction, model and effort selection, connector selection, prompt
insertion, attachment upload, submission evidence, and browser-visible error handling.

## Invariants

- every selector and interaction is ChatGPT-specific and stays below `browser/chatgpt-web/`;
- prompt insertion is chunked, abort-aware, and verified against the rendered composer;
- connector selection requires one exact configured connector and verified selected state;
- file payloads are validated and bounded before browser upload;
- interaction helpers do not own browser processes, page leases, or turn concurrency.

## Public surface

- input and attachment validation helpers;
- browser-visible ChatGPT error and confirmation helpers;
- `ChatGptBrowserInteractions`.

## Source of truth

The implementation in `src/browser/chatgpt-web/interactions.ts` is authoritative.
