# browser/chatgpt-web/turn-driver

Mirrors `src/browser/chatgpt-web/turn-driver.ts`.

## Role

Composes one authenticated ChatGPT browser turn from provider-neutral browser stages and
ChatGPT-specific interactions, completion tracking, diagnostics, and wire capture.

## Invariants

- page acquisition uses a shared `BrowserSession` lease;
- every timed interaction has a stage deadline and closes the page on timeout;
- failed managed turns discard their page lease instead of returning uncertain state to the pool;
- response listeners and prompt resources are released in `finally` paths;
- successful turns persist storage state before exposing continuation state;
- OpenAI response-event translation remains outside the browser layer in the provider adapter.

## Public surface

- `BrowserConversationTurn` and `BrowserTurn` contracts;
- `ChatGptTurnDriver`.

## Source of truth

The implementation in `src/browser/chatgpt-web/turn-driver.ts` is authoritative.
