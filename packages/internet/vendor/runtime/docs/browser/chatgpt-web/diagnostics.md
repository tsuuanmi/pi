# browser/chatgpt-web/diagnostics

Mirrors `src/browser/chatgpt-web/diagnostics.ts`.

## Role

Captures bounded, private ChatGPT browser-turn artifacts for failure analysis.

## Invariants

- diagnostic directories and trace identifiers are validated and bounded;
- sensitive task envelopes and durable identifiers are redacted;
- screenshots are limited to configured or high-value failure checkpoints;
- capture failures are logged and never replace the original turn failure;
- ChatGPT selectors and snapshot schemas remain provider-specific.

## Public surface

- `redactChatGptUiDiagnostic`;
- `browserDiagnosticCheckpoint` and `browserDiagnosticIncludesScreenshot`;
- `ChatGptBrowserDiagnostics`.

## Source of truth

The implementation in `src/browser/chatgpt-web/diagnostics.ts` is authoritative.
