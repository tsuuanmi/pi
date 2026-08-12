# Internet — Pi Integration

## Extension composition

Pi loads `dist/extension.js`. The async factory uses public extension APIs only:

```ts
const accounts = await new AccountRegistry().list();
const manager = new OwnedDaemonManager(accounts);
registerOpenAiProviders(pi, accounts);
registerInternetTools(pi, manager);
registerInternetHooks(pi, manager, accounts);
pi.registerHudProvider(readDaemonStatus);
await manager.autoStart();
```

No custom tool host/context adapter remains; tools implement Pi's current `ExtensionToolSpec`
contract directly.

## Provider readiness

Provider config uses Pi's built-in `openai-responses` API, loopback `/v1`, `authHeader: false`, and
model metadata. `before_provider_request` receives the active `context.model`; the extension maps
only its registered provider names to accounts and calls `manager.ensureReady(account.id)`. Unrelated
providers are untouched.

This hook boundary is necessary because Pi's custom stream registry is keyed by API type, not
provider name. Registering a custom `openai-responses` stream here would globally replace transport
for every provider using that API and would make multiple internet accounts overwrite each other.
The extension therefore retains Pi's authoritative Responses request conversion and SSE decoding.

Pi records hook exceptions and then proceeds with the request. On the normal path the hook completes
login/start before transport begins. If preparation fails, the loopback provider request is the
user-visible authoritative failure rather than a global transport override.

The placeholder API key only satisfies the OpenAI client contract. Inference routes are protected by
loopback binding; the real control token is used separately for `/admin/*`.

## Tools

Tools use TypeBox `parameters` and Pi's five-argument execute signature. Registered tools are:

- `internet_daemon`
- `internet_status`
- `internet_compact`
- `internet_control`
- `internet_accounts`
- `internet_account_add`
- `internet_account_set_enabled`

## Hooks and HUD

- `tool_call`: fail-closed approval for daemon admin control and future bridged `codex_*` tools.
- `before_provider_request`: readiness for this extension's provider names only.
- `turn_end`: refresh the HUD.
- `session_shutdown`: gracefully stop package-owned child daemons.

The HUD remains non-throwing and hides itself when the default endpoint is unavailable.

## Discovery and packaging

The package manifest exposes `dist/extension.js` through `pi.extensions` and publishes all of
`dist`, including `dist/daemon/runtime/`. Internal package imports use `#internet/*`; no Pi internal
`#pi/*` path is imported.

## Boundary rules

- Pi process owns extension/provider/tool composition.
- `OwnedDaemonManager` owns child processes and login lifecycle.
- The bundled daemon owns browser/session/replay behavior.
- Pi AI owns Responses transport and event decoding.
- Do not add a second browser owner, HTTP Responses parser, replay cache, or external daemon fallback.
