# `browser/response-capture.ts`

Provider-agnostic Playwright response-capture lifecycle.

## Responsibilities

- subscribe to page responses;
- delegate matching and parsing to the provider;
- wait for pending and future matching responses within a bounded deadline;
- support abort signals and preserve parser failures;
- remove listeners and wake waiters deterministically.

ChatGPT Web owns the URL matcher and wire-response parser in
`browser/chatgpt-web/wire-capture.ts` and `wire-response.ts`.

## Waiting contract

`waitForValue()` returns the latest defined parsed value, including one produced by a response that
arrives after waiting begins. It returns `undefined` only when the deadline expires without a value.
If matching responses fail to parse and no value is available, it throws an `AggregateError` with
the retained parser failures. Aborting rejects with the signal reason.
