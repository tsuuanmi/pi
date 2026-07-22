# Hooks

The hook system previously documented here is no longer implemented or exported from `packages/agent/src`.

Current extension-facing hooks are represented by the lower-layer [`ExtensionAPI`](extension-contract.md) contract:

- `session_start`
- `turn_end`
- `tool_execution_end`
- `before_agent_start`
- `tool_call`

Core agent instrumentation is exposed through [`AgentEvent`](../types.md) and [`Agent.subscribe()`](../agent.md).
