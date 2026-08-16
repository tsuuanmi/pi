# providers/chatgpt-web/transport/native-passthrough

Mirrors `src/providers/chatgpt-web/transport/native-passthrough.ts`.

## Role

Forwards supported native requests through the ChatGPT Web transport boundary.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `NativeFetch` | type — Union or alias used to constrain protocol data. | 17 |
| `NativeCodexEndpoint` | type — Union or alias used to constrain protocol data. | 18 |
| `scrubBridgeArtifactsForNative` | function — Callable operation exposed to its callers. | 42 |
| `forwardNativeCodexRequest` | function — Callable operation exposed to its callers. | 79 |

## Behavior and invariants

- Transport modules isolate external process/network details from the adapter and protocol layers.
- Native passthrough, tunnel management, browser wire capture, and wire parsing are separate paths with separate failure semantics.
- Credentials, keys, command lines, and captured payloads are validated or redacted at the transport boundary.
- Supports the limited native endpoint set without mixing it with routed browser execution.
- Removes bridge-private artifacts before forwarding.

## Related source modules

- `core/http-body.ts`
- `providers/chatgpt-web/protocol/responses/reasoning-envelope.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/transport/native-passthrough.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
