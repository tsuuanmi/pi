# cli

Mirrors `src/cli.ts`.

## Role

The command-line composition root for setup, login, diagnostics, service control, MCP, tunnel, and runtime operations.

## Public surface

The module is consumed as a command-line entrypoint and has no named runtime exports.

## Behavior and invariants

- Dispatches `setup`, `login`, `doctor`, `serve`, `mcp`, `service`, `tunnel`, `open`, and `uninstall` commands.
- Service-facing commands use the persisted control token and runtime command rather than reaching into daemon internals.

## Related source modules

- `adapters/chatgpt-web/browser/login.ts`
- `adapters/chatgpt-web/lifecycle/control.ts`
- `adapters/chatgpt-web/lifecycle/config.ts`
- `adapters/chatgpt-web/lifecycle/doctor.ts`
- `adapters/chatgpt-web/tools/mcp-server.ts`
- `core/process.ts`
- `adapters/chatgpt-web/server/routes.ts`
- `core/service.ts`
- `adapters/chatgpt-web/lifecycle/setup.ts`
- `adapters/chatgpt-web/transport/tunnel.ts`
- `adapters/chatgpt-web/transport/tunnel-service.ts`
- `core/config.ts`

## Source of truth

The implementation in `src/cli.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
