# Internet — Pi Integration

## Extension composition

Pi loads `dist/extension.js`. The async factory uses public extension APIs only:

```ts
const accounts = await new AccountRegistry().list();
const manager = new OwnedDaemonManager(accounts);
const settings = new InternetSettingsStore();
await registerOpenAiProviders(pi, accounts);
registerInternetTools(pi, manager, settings);
registerInternetHooks(pi, manager, accounts, settings);
pi.registerHudProvider(readDaemonStatus);
await manager.autoStart();
```

No custom tool host/context adapter remains; tools implement Pi's current `ExtensionToolSpec`
contract directly.

## Provider readiness

Provider config uses Pi's built-in `openai-responses` API, loopback `/v1`, `authHeader: false`, and
model metadata. `before_provider_request` receives the active `context.model`; the extension maps
only its registered provider names to accounts, calls `manager.ensureReady(account.id)`, and adds the
daemon's canonical turn/environment fields to the serialized payload. Unrelated providers are
untouched. With `autoLogin:false`, the hook suppresses browser launch and notifies interactive users.
Because Pi's hook dispatcher swallows hook exceptions, readiness/adaptation failures return a fixed,
content-free request with a reserved unknown local route; the original unadapted request is never
forwarded.

This hook boundary is necessary because Pi's custom stream registry is keyed by API type, not
provider name. Registering a custom `openai-responses` stream here would globally replace transport
for every provider using that API and would make multiple internet accounts overwrite each other.
The extension therefore retains Pi's authoritative standard Responses conversion and SSE decoding;
the provider-scoped hook only adds daemon-required replay metadata after conversion.

On the normal path the hook completes login/start and payload adaptation before transport begins.
If preparation fails, the hook returns a fixed content-free request with a reserved unknown local
`chatgpt-web/*` slug. The original payload is never forwarded: a reachable daemon rejects the slug
with HTTP 400 before browser/native-upstream execution, while startup failure ends at loopback
transport.

The placeholder API key only satisfies the OpenAI client contract. Inference routes are protected by
loopback binding; the real control token is used separately for `/admin/*`.

## Tools

Tools use TypeBox `parameters` and Pi's five-argument execute signature. Registered tools are:

- `internet_daemon`
- `internet_harness`
- `internet_status`
- `internet_doctor`
- `internet_compact`
- `internet_control`
- `internet_accounts`
- `internet_account_add`
- `internet_account_set_enabled`
- `internet_settings`
- `internet_search`
- `internet_fetch`

## Hooks and HUD

- `tool_call`: fail-closed approval for daemon/harness control and bridged `codex_*` tools.
- `before_provider_request`: readiness for this extension's provider names only, honoring
  `autoLogin`.
- `turn_end`: refresh the HUD. Daemon-owned idle shutdown keeps the session's ChatGPT conversation
  alive and then closes browser/broker/tunnel state ~1 minute after the last request.

The HUD remains non-throwing and hides itself when the default endpoint is unavailable.

## Discovery and packaging

The package manifest exposes `dist/extension.js` through `pi.extensions` and publishes all of
`dist`, including `dist/daemon/runtime/`. Internal package imports use `#internet/*`; no Pi internal
`#pi/*` path is imported.

## Boundary rules

- Pi process owns extension/provider/tool composition.
- `OwnedDaemonManager` owns child processes and login lifecycle.
- The bundled daemon owns browser/session/replay behavior.
- Pi AI owns standard Responses conversion, transport, and event decoding.
- `backends/openai/turn/files.ts` owns bounded workspace-local `@file` expansion only.
- `backends/openai/turn/request.ts` owns pure daemon-contract payload adaptation only.
- `daemon/harness.ts` owns account-scoped Full-mode paths/private runtime-key storage; the vendored
  daemon remains the only broker/MCP implementation.
- `daemon/doctor.ts` owns the bounded one-shot diagnostic process boundary and report validation;
  `tools/doctor.ts` owns only Pi presentation.
- `web/*` owns public search/fetch transport and SSRF/size/content safeguards; it never receives the
  daemon admin token.
- Do not add a second browser owner, HTTP Responses parser, replay cache, or external daemon fallback.
