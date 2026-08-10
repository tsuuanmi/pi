# @tsuuanmi/pi-agent Documentation

`@tsuuanmi/pi-agent` contains the lower-layer standard agent: the `Agent` class, its model/tool loop, shared message/tool/event types, execution-environment abstractions, and small Node-only utilities. Higher-level packages configure the agent, register host-specific tools, and attach UI/telemetry without reimplementing agent behavior.

## Package entry points

- `@tsuuanmi/pi-agent` exports browser-safe/core APIs from `src/index.ts`.
- `@tsuuanmi/pi-agent/node` exports `NodeExecutionEnv` and Node-only process/file utilities from `src/node/node.ts`.

## Standard package boundary

- `@tsuuanmi/pi-agent` owns generic agent behavior, message/event/tool contracts, and canonical model/thinking-level types.
- `@tsuuanmi/pi-orchestrator` owns task, team, and orchestration contracts built on `Agent`.
- `@tsuuanmi/pi-ai` owns provider/model transport, streaming adapters, and the canonical `ThinkingLevel` type.
- Host packages such as `@tsuuanmi/pi` own concrete tools and register them with `Tool` / `ToolRegistry` APIs; workflow packages own host adapters and workflow policy.
- Node-only utilities are exported from `@tsuuanmi/pi-agent/node`.

This package centralizes the model/tool loop behind `Agent` while keeping provider transport and concrete tools configurable.

## Documentation map

The docs tree mirrors the source domain folders under `packages/agent/src`. The public `Agent` facade lives under `agent/`; message modeling lives under `messages/`; and host tools live under `tool/`. The loop and provider stream adapter are internal implementation details.

- [`architecture.md`](architecture.md) - Package ownership and extension boundaries for `Agent`, `Tool`, `AgentHook`, and `AgentEvent`.
- [`agent/index.md`](agent/index.md) - `src/agent/index.ts`: `Agent` class, state management, event subscription, message queues, and lifecycle control.
- [`config.md`](config.md) - `src/config.ts`: loop/provider configuration and request observation.
- [`context.md`](context.md) - `src/context.ts`: the host-neutral context passed to the agent loop.
- [`events.md`](events.md) - `src/events.ts`: agent lifecycle events, warnings, and traces.
- [`hooks.md`](hooks.md) - `src/hooks.ts`: public lifecycle and execution hook contracts.
- [`hook-adapter.md`](hook-adapter.md) - `src/hook-adapter.ts`: adaptation from registered hooks to loop callbacks.
- [`loop.md`](loop.md) - `src/loop.ts`: internal turn execution, steering, follow-up, and abort handling.
- `src/agent/provider.ts`: internal provider response streaming.
- `src/agent/tool-execution.ts`: internal tool-call preparation and execution.
- `src/agent/trace.ts`: internal timing and trace-span helpers.
- [`stream.md`](stream.md) - `src/stream.ts`: the provider response stream function configured by `Agent`.
- [`run.md`](run.md) - `src/run.ts`: `Agent.run()` options and results.
- [`tool-call.md`](tool-call.md) - `src/tool-call.ts`: model-produced tool-call content used by loop and pruning code.
- [`messages/messages.md`](messages/messages.md) - `src/messages/types.ts` and `src/messages/messages.ts`: message roles and `convertToLlm()` conversion.
- [`node/index.md`](node/index.md) - `src/node/node.ts` and `src/node/*`: Node-only process, JSONL, path, and mutation-queue helpers.
- [`node/env/nodejs.md`](node/env/nodejs.md) - `src/node/env/*`: `ExecutionEnv`, `FileSystem`, `Shell`, typed `Result`, `FileError`, `ExecutionError`, and `NodeExecutionEnv`.
- Pi owns session-aware subagents, lifecycle tools, persistence, progress tracking, and yield-result extraction under `packages/pi/src/subagents/*`.
- [`tool/registry.md`](tool/registry.md) - `src/tool/tool.ts`, `src/tool/registry.ts`, and `src/tool/policy.ts`: `Tool.define()`, `ContextToolSpec`, `ToolRegistry`, and `Agent.setTools()` for host-owned tools.

Legacy compatibility docs and docs for removed source modules are intentionally not retained.
