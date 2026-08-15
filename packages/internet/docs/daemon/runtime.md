# daemon/runtime

Mirrors `src/daemon/runtime.ts`.

`resolveDaemonRuntime()` locates `dist/daemon/runtime/manifest.json` beside the compiled module and
returns its root, executable launcher, and validated manifest.

The schema-1 manifest supports native `linux` and `darwin` artifacts on `x64` and `arm64`. Resolution
rejects unsupported platforms/architectures, mismatched host artifacts, absolute launcher paths,
launcher paths that escape the runtime directory, and launchers that are not executable.

`moduleUrl`, `platform`, and `arch` overrides exist for deterministic tests. Release CI builds,
tests, and dry-runs package contents independently on Ubuntu and macOS, so each package artifact
contains a launcher matching its build host.
