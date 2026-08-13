# tools/daemon

Mirrors `src/tools/daemon.ts`.

Registers `internet_daemon` — logs in, starts, stops, restarts, or inspects the package-owned
daemon. Parameters: optional `account` and a required `action` from
`"status" | "login" | "start" | "stop" | "restart"`. Delegates to the `OwnedDaemonManager`
(`login`, `start`, `stop`, `restart`; `status` reads state) and returns the resulting
`OwnedDaemonStatus` as text and as `details`.
