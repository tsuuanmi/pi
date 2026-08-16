# adapters/chatgpt-web/transport/tunnel

Mirrors `src/adapters/chatgpt-web/transport/tunnel.ts`.

## Role

Installs, configures, starts, stops, and inspects the authenticated remote tunnel client.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `TUNNEL_READY_TIMEOUT_MS` | const — Exported constant, schema, selector, or protocol marker. | 12 |
| `installTunnelClient` | function — Callable operation exposed to its callers. | 71 |
| `installRuntimeKey` | function — Callable operation exposed to its callers. | 132 |
| `managedRuntimeKeyPath` | function — Callable operation exposed to its callers. | 139 |
| `installRuntimeKeyBytes` | function — Callable operation exposed to its callers. | 143 |
| `createTunnelConfig` | function — Callable operation exposed to its callers. | 151 |
| `mcpCommand` | function — Callable operation exposed to its callers. | 185 |
| `connectTunnel` | function — Callable operation exposed to its callers. | 199 |
| `stopTunnel` | function — Callable operation exposed to its callers. | 226 |
| `TunnelRuntimeStatus` | interface — Structural type contract for callers and implementers. | 241 |
| `tunnelCommandOutput` | function — Callable operation exposed to its callers. | 250 |
| `tunnelConnectLaunchError` | function — Callable operation exposed to its callers. | 285 |
| `parseTunnelStatus` | function — Callable operation exposed to its callers. | 315 |
| `tunnelStatus` | function — Callable operation exposed to its callers. | 350 |
| `waitForTunnelReady` | function — Callable operation exposed to its callers. | 363 |
| `tunnelClientVersion` | function — Callable operation exposed to its callers. | 376 |

## Behavior and invariants

- Transport modules isolate external process/network details from the adapter and protocol layers.
- Native passthrough, tunnel management, browser wire capture, and wire parsing are separate paths with separate failure semantics.
- Credentials, keys, command lines, and captured payloads are validated or redacted at the transport boundary.
- Installs the platform tunnel asset, verifies its checksum, installs the runtime key, and writes managed configuration.
- Readiness polling uses a fixed 120-second startup window.

## Related source modules

- `adapters/chatgpt-web/lifecycle/config.ts`
- `core/process.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/transport/tunnel.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
