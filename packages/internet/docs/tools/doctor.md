# tools/doctor

Mirrors `src/tools/doctor.ts`.

Registers `internet_doctor` — runs ChatGPT Web daemon diagnostics and returns structured check
results. Optional `account` parameter; calls `runDaemonDoctor(account, { signal })` and returns the
formatted report as text plus the full report as `details`.

The text formatting lists one line per check as `[status][scope] message` (with indented detail),
followed by `Doctor result: ready` or `Doctor result: not ready`.
