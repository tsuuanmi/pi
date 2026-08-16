# providers/chatgpt-web/transport/wire-capture

Mirrors `src/providers/chatgpt-web/transport/wire-capture.ts`.

## Role

Captures the authenticated ChatGPT conversation response from browser network traffic.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ChatGptWireCapture` | class — Stateful component with lifecycle or coordination methods. | 16 |

## Behavior and invariants

- Transport modules isolate external process/network details from the adapter and protocol layers.
- Native passthrough, tunnel management, browser wire capture, and wire parsing are separate paths with separate failure semantics.
- Credentials, keys, command lines, and captured payloads are validated or redacted at the transport boundary.
- Attaches to browser network responses and retains only the relevant conversation response.
- Its lifecycle surrounds one browser turn and keeps Playwright details out of protocol code.

## Related source modules

- `providers/chatgpt-web/transport/wire-response.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/transport/wire-capture.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
