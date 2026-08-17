# cli

Mirrors `src/cli.ts`.

## Role

The command-line composition root for setup, login, diagnostics, service control, MCP, tunnel, and runtime operations.

## Public surface

The module is consumed as a command-line entrypoint and has no named runtime exports.

## Behavior and invariants

- Dispatches `setup`, `login`, `doctor`, `serve`, `mcp`, `service`, `tunnel`, `open`, and `uninstall` commands.
- `--adapter` selects ChatGPT Web or Gemini Web. Gemini setup is browser-only; MCP, tunnels, and Full mode remain ChatGPT-specific and fail explicitly.
- Service-facing commands use the persisted control token and runtime command rather than reaching into daemon internals.

## Related source modules

- `browser/chatgpt-web/login.ts`
- `browser/gemini-web/login.ts`
- `providers/chatgpt-web/lifecycle/control.ts`
- `providers/chatgpt-web/lifecycle/config.ts`
- `providers/chatgpt-web/lifecycle/doctor.ts`
- `providers/chatgpt-web/tools/mcp-server.ts`
- `core/process.ts`
- `providers/chatgpt-web/server/routes.ts`
- `providers/gemini-web/factory.ts`
- `providers/gemini-web/lifecycle/doctor.ts`
- `providers/gemini-web/server.ts`
- `core/service.ts`
- `providers/chatgpt-web/lifecycle/setup.ts`
- `providers/chatgpt-web/transport/tunnel.ts`
- `providers/chatgpt-web/transport/tunnel-service.ts`
- `core/config.ts`

## Source of truth

The implementation in `src/cli.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
