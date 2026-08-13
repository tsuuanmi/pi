# extension

Mirrors `src/extension.ts`.

The extension composition root loaded by Pi. It is a pure composition function: it constructs the
manager, settings store, and account list, registers providers/tools/hooks/HUD, then auto-starts
authenticated daemons.

## Signature

```ts
export default async function internetExtension(host: ExtensionAPI): Promise<void>
```

## Composition order

1. `new AccountRegistry().list()` — read current account routing metadata.
2. `new OwnedDaemonManager(accounts)` — build the daemon/tunnel lifecycle owner.
3. `new InternetSettingsStore()` — load private package settings.
4. `registerOpenAiProviders(host, accounts)` — register capability-scoped `chatgpt-web/*` providers.
5. `registerInternetTools(host, manager, settings)` — register all Pi tools.
6. `registerInternetHooks(host, manager, accounts, settings)` — register readiness/adaptation hooks.
7. `host.registerHudProvider(readDaemonStatus)` — register the daemon HUD provider.
8. `manager.autoStart()` — start daemons for enabled accounts that already have verified login.

All steps use public `ExtensionAPI` surface only. The manager and settings store are created here and
shared by the tools and hooks they are passed to.
