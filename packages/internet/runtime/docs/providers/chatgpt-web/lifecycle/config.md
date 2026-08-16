# providers/chatgpt-web/lifecycle/config

Mirrors `src/providers/chatgpt-web/lifecycle/config.ts`.

## Role

Defines ChatGPT Web runtime configuration, defaults, validation, and broker endpoint resolution.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `DEFAULT_CONNECTOR_NAME` | const — Exported constant, schema, selector, or protocol marker. | 25 |
| `RuntimeMode` | type — Union or alias used to constrain protocol data. | 27 |
| `resolveSetupConnectorName` | function — Callable operation exposed to its callers. | 29 |
| `TunnelConfig` | interface — Structural type contract for callers and implementers. | 39 |
| `AppConfig` | interface — Structural type contract for callers and implementers. | 48 |
| `isWindowsPipeEndpoint` | function — Callable operation exposed to its callers. | 108 |
| `defaultBrokerEndpoint` | function — Callable operation exposed to its callers. | 111 |
| `resolveBrokerEndpoint` | function — Callable operation exposed to its callers. | 117 |
| `defaultConfig` | function — Callable operation exposed to its callers. | 122 |
| `defaultChromeExecutable` | function — Callable operation exposed to its callers. | 149 |
| `loadConfig` | function — Callable operation exposed to its callers. | 162 |
| `loadConfigForSetup` | function — Callable operation exposed to its callers. | 168 |
| `saveConfig` | function — Callable operation exposed to its callers. | 283 |
| `providerConfig` | function — Callable operation exposed to its callers. | 287 |

## Behavior and invariants

- Lifecycle modules are used by setup/doctor/CLI commands and by the daemon control path, not by provider content conversion.
- Configuration and administrative requests are validated at the boundary and protected by the local runtime control token.
- Setup and diagnostics preserve actionable distinctions between required runtime failures and optional account capabilities.
- Rejects unknown fields, invalid paths, unsafe values, and missing control/runtime credentials.
- Windows broker endpoints use named pipes; other platforms use a socket under the runtime home.

## Related source modules

- `core/config.ts`
- `providers/chatgpt-web/conversation/journal.ts`
- `providers/chatgpt-web/protocol/types.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/lifecycle/config.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
