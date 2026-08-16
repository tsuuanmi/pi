# adapters/chatgpt-web/transport/tunnel-service

Mirrors `src/adapters/chatgpt-web/transport/tunnel-service.ts`.

## Role

Manages the macOS launch service used to keep the local tunnel client running.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `TunnelServiceStatus` | interface — Structural type contract for callers and implementers. | 10 |
| `tunnelServiceDefinition` | function — Callable operation exposed to its callers. | 51 |
| `getTunnelServiceStatus` | function — Callable operation exposed to its callers. | 87 |
| `tunnelServiceDefinitionMatches` | function — Callable operation exposed to its callers. | 103 |
| `installTunnelService` | function — Callable operation exposed to its callers. | 108 |
| `startTunnelService` | function — Callable operation exposed to its callers. | 126 |
| `stopTunnelService` | function — Callable operation exposed to its callers. | 141 |
| `restartTunnelService` | function — Callable operation exposed to its callers. | 150 |
| `uninstallTunnelService` | function — Callable operation exposed to its callers. | 155 |

## Behavior and invariants

- Transport modules isolate external process/network details from the adapter and protocol layers.
- Native passthrough, tunnel management, browser wire capture, and wire parsing are separate paths with separate failure semantics.
- Credentials, keys, command lines, and captured payloads are validated or redacted at the transport boundary.

## Related source modules

- `adapters/chatgpt-web/lifecycle/config.ts`
- `core/process.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/transport/tunnel-service.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
