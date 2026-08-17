# tools/status

Mirrors `src/tools/status.ts`.

Registers `internet_status` — shows browser-provider daemon health and active turn counts. Optional
`account` parameter; resolves the account via `AccountRegistry.get`, builds a `DaemonClient`, and
reads its health. Returns the endpoint and health as text and as `details`.
