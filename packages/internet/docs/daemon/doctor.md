# daemon/doctor

Mirrors `src/daemon/doctor.ts`.

Bounded daemon diagnostics with strict report validation. It runs the bundled CLI's
`doctor --json` command without starting the daemon or opening Chrome, and is read-only.

## Types

- `DoctorStatus` — `"ok" | "warning" | "error"`.
- `DoctorCheck` — `{ id, status, message, detail?, scope: "pi" | "upstream" }`.
- `DoctorReport` — `{ ok, upstreamOk, mode?, checks }`. `ok` is true when no Pi-scoped check is
  `error`; `upstreamOk` mirrors the raw daemon `ok`.

## `runDaemonDoctor`

```ts
runDaemonDoctor(account, options?): Promise<DoctorReport>
```

1. Resolves the bundled runtime.
2. Executes `<launcher> --home <configDir> doctor --json` with a `45_000`ms timeout, `1MiB` buffer,
   `SIGKILL` on timeout, and the account config dir as the daemon home. An `AbortSignal` can cancel
   it. Any non-zero exit code other than `1` (the daemon's "unhealthy" exit) raises an error
   (`daemon_doctor_failed`) — distinguishing timeout/cancel/stderr failures.
3. Parses and validates the JSON report structure and the checks (`id`, `status`, `message`,
   optional `detail`).
4. Validates consistency: `ok` must equal whether any check is `error`, and `ok` must match the
   process exit code (`0`).
5. Adapts the report, tagging each check with a `scope` — `pi` for `config`, `browser-host`,
   `chrome`, `login`, `proxy`; `upstream` for `codex`, `service`, `tools`, `tunnel-binary`,
   `tunnel-key`, `tunnel-service`, `tunnel-runtime`, `connector`. Unknown check ids throw.

All failures raise `InternetError` with code `daemon_doctor_failed`.
