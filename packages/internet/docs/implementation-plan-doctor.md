# Internet — Implemented Plan (R4: `internet_doctor`)

Reviewed implementation for exposing the vendored daemon's `doctor --json` diagnostics as a Pi
tool. This document records the source-grounded design, corrections made during implementation,
file boundaries, tests, and verification gate.

> Status: **implemented.** R5–R7 remain in `roi-roadmap.md`.

---

## Ground truth

The vendored daemon owns the diagnostic logic:

- `vendor/codex-chatgpt-web/src/doctor.ts` defines
  `DoctorReport { ok, mode?, checks[] }` and per-check `ok | warning | error` status.
- `vendor/codex-chatgpt-web/src/cli.ts` exposes only the CLI command `doctor --json`; there is no
  doctor HTTP route.
- `doctor --json` writes a valid report to stdout, then intentionally exits with status 1 when
  `report.ok` is false.
- The global `--home PATH` option selects the account config directory. The lifecycle manager uses
  the same account-scoped form for `login` and `serve`.

The Pi package therefore consumes the fixed vendored diagnostic source; it does not duplicate,
filter, or reinterpret the daemon's checks.

## Review corrections to the initial plan

The implementation review changed four details before production code was finalized:

1. **Valid exit-1 reports must be returned.** Treating every non-zero status as an execution error
   would discard the failed checks that the tool exists to expose. Exit 1 is accepted only when
   stdout validates as a `DoctorReport`; other command failures remain errors.
2. **Use `execFile`, not manual `spawn` buffering.** This is a bounded one-shot command. `execFile`
   avoids a shell and supplies native timeout, cancellation, kill signal, and output limits with
   less lifecycle code.
3. **Propagate Pi cancellation.** The tool's `AbortSignal` reaches the child command so abandoned
   calls do not leave work running.
4. **Keep the runner internal.** `runDaemonDoctor` is an implementation dependency of the bundled
   Pi tool, not a required package API. `src/index.ts` is unchanged to avoid enlarging the public
   surface.

## Implemented boundaries

### `src/daemon/doctor.ts`

Owns the complete one-shot process and validation boundary:

- Resolves the bundled runtime through `resolveDaemonRuntime()`.
- Executes the launcher without a shell:

  ```text
  <launcher> --home <account.configDir> doctor --json
  ```

- Also sets `CODEX_CHATGPT_WEB_HOME` to the account config directory, matching lifecycle commands.
- Uses a 45-second default timeout (above the vendored 30-second launcher inspection), `SIGKILL`
  on timeout/abort, and a 1 MiB limit for each output stream.
- Accepts an injected `execFile`, runtime resolver, signal, and timeout for deterministic tests.
- Strictly validates:
  - `ok` is boolean;
  - optional `mode` is `browser-only | full`;
  - `checks` is an array;
  - each check has string `id`/`message`, a known status, and optional string `detail`;
  - the aggregate matches error-check presence and the documented exit 0/1 contract.
- Returns a valid report from command exit 0 or the daemon's documented report-failure exit 1.
- Marks every check as `scope: "pi" | "upstream"`; Codex route, OS service, browser-only tool, and
  full-mode tunnel checks are upstream concerns, while config/browser/login/proxy checks determine
  Pi readiness.
- Preserves the upstream daemon's aggregate as `upstreamOk`, and computes `ok` from Pi-scoped errors so a
  normal Pi installation does not falsely fail for lacking a native Codex route or OS service.
- Converts runtime, execution, timeout, cancellation, and malformed-output failures into
  `InternetError { code: "daemon_doctor_failed", retryable: false }`.

The module does not manage a long-lived daemon and does not depend on `OwnedDaemonManager`.

### `src/tools/doctor.ts`

Owns only the Pi-facing tool:

- Registers `internet_doctor` with optional account id.
- Resolves the account through `AccountRegistry`.
- Passes the tool call's abort signal to `runDaemonDoctor`.
- Returns the validated report as structured `details`.
- Renders each check with status and scope, plus optional detail, followed by
  `Doctor result: ready | not ready`.

The tool is read-only and is not included in the destructive approval hook. Running it does not
start the daemon, open Chrome, or change account state.

### Wiring and errors

- `src/core/errors.ts` adds the single authoritative `daemon_doctor_failed` code.
- `src/tools/register.ts` registers the doctor after `internet_status`.
- `src/index.ts` remains unchanged; no new public package API is introduced.

## Tests

### `test/daemon/doctor.test.ts`

Covers the process and parser boundary:

- launcher path, account-scoped arguments/environment, timeout, output limit, and kill signal;
- valid healthy report on exit 0;
- valid failed report on documented exit 1, including exhaustive upstream/Pi scope adaptation;
- contradictory aggregate/check/exit combinations;
- invalid JSON and invalid shape;
- non-doctor command failure with captured stderr;
- timeout and caller cancellation messages;
- runtime-resolution failure wrapping.

### `test/tools/doctor.test.ts`

Covers account lookup, abort-signal propagation, structured details, and readable output.

### `test/extension.test.ts`

Confirms `internet_doctor` is part of the extension's registered tool list.

## Documentation updates

- `README.md` documents the tool and its read-only lifecycle behavior.
- `architecture.md`, `how-it-works.md`, `pi-integration.md`, and `layout.md` record the process/tool
  separation and module placement.
- `roi-roadmap.md` marks R4 implemented.
- `best-of-both.md` and `comparison-prometheus.md` retain R5/R6 lessons while removing stale
  pre-R3 search and capture claims.
- `CHANGELOG.md` records the new user-visible tool.

## Verification gate

Run after rebuilding because package tests import from `dist`:

1. `npm run build` in `packages/internet`.
2. `npm test` in `packages/internet`.
3. `npx biome check --write --error-on-warnings packages/internet` from the repository root.
4. `npx tsgo --noEmit` from the repository root.
5. `git diff --check -- packages/internet`.
6. `npm pack --dry-run --ignore-scripts` in `packages/internet`.

## Out of scope

- R5 hybrid network/DOM capture.
- R6 multi-backend/fusion.
- R7 native Codex tool bridge.
- Changes to the fixed vendored daemon source.
- Non-Linux runtime artifacts.
