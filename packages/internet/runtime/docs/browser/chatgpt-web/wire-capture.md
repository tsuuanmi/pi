# browser/chatgpt-web/wire-capture

Mirrors `src/browser/chatgpt-web/wire-capture.ts`.

## Role

Specializes the reusable response-capture lifecycle for ChatGPT conversation responses.

## Boundary

This module owns ChatGPT URL and method matching and delegates ChatGPT wire parsing to
`providers/chatgpt-web/transport/wire-response.ts`. Generic listener ownership, future-response
waiting, timeout, cancellation, and parser-failure propagation remain in
`browser/response-capture.ts`.

## Public surface

- `ChatGptWireCapture`, including abort-aware `waitForText`.

## Source of truth

The implementation in `src/browser/chatgpt-web/wire-capture.ts` is authoritative.
