# browser/chatgpt-web/completion

Mirrors `src/browser/chatgpt-web/completion.ts`.

## Role

Owns ChatGPT-specific submission evidence, completion stabilization, DOM health, visible trace
tracking, response snapshots, and stalled-turn diagnostics.

## Boundary

This module may know ChatGPT selectors and rendered response semantics. It depends on the
provider-neutral browser lifecycle only through Playwright page and locator values; it does not own
browser processes, page capacity, or turn concurrency.

## Public surface

- completion and DOM-health grace constants;
- `chatGptTurnIsComplete` and `chatGptSubmissionEvidence`;
- `ChatGptCompletionTracker`, `ChatGptTurnDomHealthTracker`, and `ChatGptVisibleTraceTracker`;
- `ChatGptCompletionInspector` for response snapshots and stalled-turn diagnostics.

## Source of truth

The implementation in `src/browser/chatgpt-web/completion.ts` is authoritative.
