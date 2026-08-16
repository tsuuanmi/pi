# `browser/response-capture.ts`

Provider-agnostic Playwright response-capture lifecycle.

## Responsibilities

- subscribe to page responses;
- delegate matching and parsing to the provider;
- retain pending parsed values and wait with a bounded timeout;
- remove listeners deterministically.

ChatGPT Web owns the URL matcher and wire-response parser in
`providers/chatgpt-web/transport/wire-capture.ts` and `wire-response.ts`.
