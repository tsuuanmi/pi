# @tsuuanmi/pi-agent Documentation

`@tsuuanmi/pi-agent` contains the lower-layer standard agent runtime: the `Agent` class, the agent loop, shared message/tool/event types, explicit runtime/backend contracts, execution-environment abstractions, reusable subagent lifecycle behavior, and small Node-only utilities. Higher-level packages import these contracts, adapt host contexts, register host-specific tools, and attach UI/telemetry without reimplementing agent behavior.

## Package entry points

- `@tsuuanmi/pi-agent` exports browser-safe/core APIs from `src/index.ts`.
- `@tsuuanmi/pi-agent/node` exports `NodeExecutionEnv`, `ProcessRuntime`, and Node-only process/file utilities from `src/node/node.ts`.

## Standard package boundary

- `@tsuuanmi/pi-agent` owns agent behavior, runtime seams, message/event/tool contracts, shared subagent contracts, thinking-level validation, and host-neutral subagent lifecycle tools.
- `@tsuuanmi/pi-orchestrator` owns task, team, and orchestration contracts built on `Agent`.
- `@tsuuanmi/pi-ai` owns provider/model transport, streaming adapters, and the canonical `ThinkingLevel` type.
- Host packages such as `@tsuuanmi/pi` own concrete runtime tools and register them with `Tool` / `ToolRegistry` APIs; workflow packages own host adapters and workflow policy.
- Node-only runtimes and utilities are exported from `@tsuuanmi/pi-agent/node`.
- Protocol-specific integrations such as ACP should be implemented as `AgentRuntime` providers in the Node subpath or optional integration packages, not by adding protocol dependencies to the browser-safe core entry point.

This package intentionally differs from monolithic config-driven agents: it centralizes reusable behavior and contracts while keeping provider transport, concrete tools, and optional protocol backends pluggable.

## Documentation map

The docs tree mirrors the source domain folders under `packages/agent/src`. Runtime contracts live at the package source root; agent behavior remains under `agent/`, message modeling under `messages/`, and host tools under `tool/`.

- [`architecture.md`](architecture.md) - Package ownership and extension boundaries for `Agent`, `Tool`, `AgentHook`, and `AgentEvent`.
- [`agent/index.md`](agent/index.md) - `src/agent/index.ts`: `Agent` class, state management, event subscription, message queues, and lifecycle control.
- [`config.md`](config.md) - `src/config.ts`: loop/provider configuration and request observation.
- [`context.md`](context.md) - `src/context.ts`: the host-neutral agent context passed to runtimes and loops.
- [`events.md`](events.md) - `src/events.ts`: agent lifecycle events, runtime stream events, warnings, and traces.
- [`hooks.md`](hooks.md) - `src/hooks.ts`: public lifecycle and execution hook contracts.
- [`hook-adapter.md`](hook-adapter.md) - `src/hook-adapter.ts`: adaptation from registered hooks to loop callbacks.
- [`loop.md`](loop.md) - `src/loop.ts`: `agentLoop()`, `agentLoopContinue()`, turn execution, tool execution, steering, follow-up, and abort handling.
- [`backend.md`](backend.md) - `src/backend.ts`: backend identity and process/protocol metadata.
- [`runtime.md`](runtime.md) - `src/runtime.ts`: the custom runtime/backend stream contract.
- [`default-runtime.md`](default-runtime.md) - `src/default-runtime.ts`: the standard LLM/tool-loop runtime implementation.
- [`run.md`](run.md) - `src/run.ts`: runtime request/result contracts and `Agent.run()` options/results.
- [`tool-call.md`](tool-call.md) - `src/tool-call.ts`: model-produced tool-call content used by loop and pruning code.
- [`messages/messages.md`](messages/messages.md) - `src/messages/messages.ts`: non-LLM agent message roles and `convertToLlm()` conversion.
- [`node/index.md`](node/index.md) - `src/node/node.ts` and `src/node/*`: Node-only process, process-runtime, JSONL, path, and mutation-queue helpers.
- [`node/env/nodejs.md`](node/env/nodejs.md) - `src/node/env/*`: `ExecutionEnv`, `FileSystem`, `Shell`, typed `Result`, `FileError`, `ExecutionError`, and `NodeExecutionEnv`.
- [`subagents/index.md`](subagents/index.md) - `src/subagents/*`: `SubagentManager`, durable record/request/result types, thinking validation, lifecycle tools, progress tracking, and yield-result extraction.
- [`tool/registry.md`](tool/registry.md) - `src/tool/tool.ts`, `src/tool/registry.ts`, and `src/tool/policy.ts`: `Tool.define()`, `ToolRegistry`, and `Agent.setTools()` for host-owned tools.

Legacy compatibility docs and docs for removed source modules are intentionally not retained.
