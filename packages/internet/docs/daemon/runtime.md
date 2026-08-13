# daemon/runtime

Mirrors `src/daemon/runtime.ts`.

Bundled artifact resolution and platform validation.

## Types

- `RuntimeManifest` — `{ schemaVersion: 1, appVersion, platform, arch, launcher }`.
- `DaemonRuntime` — `{ root, launcher, manifest }`.
- `ResolveDaemonRuntimeOptions` — `{ platform?, arch?, moduleUrl? }` (defaults to the current
  process values).

## `resolveDaemonRuntime`

```ts
resolveDaemonRuntime(options?): Promise<DaemonRuntime>
```

Resolves the bundled runtime directory (relative to this module), reads `runtime/manifest.json`, and
returns the root, launcher, and manifest. It throws unless:

- The platform is `linux` (the bundled daemon is Linux-only).
- The manifest `schemaVersion` is `1` and `platform`/`arch` match the requested values.
- The launcher exists and is executable (`access(launcher, X_OK)`).

`moduleUrl` lets callers override the module path used to locate the `runtime/` directory (used for
tests and bundling).
