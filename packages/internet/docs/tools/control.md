# tools/control

Mirrors `src/tools/control.ts`.

Registers `internet_control` — drains, resumes, shuts down, or cancels browser turns on the local
daemon. Parameters: optional `account` and a required `action` from
`"drain" | "resume" | "shutdown" | "cancel-browser-turns"`. Calls `DaemonClient.control(action)`
and returns the admin result as text (defaulting to `{ status: "ok" }`) and as `details`.
