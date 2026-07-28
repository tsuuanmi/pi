# @tsuuanmi/pi-agent Documentation

`@tsuuanmi/pi-agent` contains the lower-layer standard agent runtime: the `Agent` class, `Orchestrator` scheduling, the agent loop, shared message/tool/event types, explicit runtime/backend contracts, execution-environment abstractions, subagent contracts, and small Node-only utilities. Higher-level packages import these contracts, register concrete tools, and attach UI/telemetry without reimplementing agent behavior.

## Package entry points

- `@tsuuanmi/pi-agent` exports browser-safe/core APIs from `src/index.ts`.
- `@tsuuanmi/pi-agent/node` exports `NodeExecutionEnv`, `ProcessRuntime`, and Node-only process/file utilities from `src/node/node.ts`.

## Standard package boundary

- `@tsuuanmi/pi-agent` owns agent behavior, runtime seams, message/event/tool contracts, orchestration primitives, and shared subagent contracts.
- `@tsuuanmi/pi-ai` owns provider/model transport and streaming adapters.
- Host packages such as `@tsuuanmi/pi` own concrete tools and register them with `AgentTool` / `ToolRegistry` APIs.
- Node-only runtimes and utilities are exported from `@tsuuanmi/pi-agent/node`.
- Protocol-specific integrations such as ACP should be implemented as `AgentRuntime` providers in the Node subpath or optional integration packages, not by adding protocol dependencies to the browser-safe core entry point.

This package intentionally differs from monolithic config-driven agents: it centralizes reusable behavior and contracts while keeping provider transport, concrete tools, and optional protocol backends pluggable.

## Documentation map

The docs tree mirrors `packages/agent/src` so source modules and their docs use the same folder structure.

- [`agent/agent.md`](agent/agent.md) - `src/agent/agent.ts`: `Agent` class, state management, event subscription, message queues, and lifecycle control.
- [`agent/runtime/loop.md`](agent/runtime/loop.md) - `src/agent/runtime/loop.ts`: `agentLoop()`, `agentLoopContinue()`, turn execution, tool execution, steering, follow-up, and abort handling.
- [`agent/runtime/events.md`](agent/runtime/events.md) - `src/agent/runtime/events.ts`: lifecycle events and instrumentation points emitted by `Agent` and the loop.
- [`api/extension-contract.md`](api/extension-contract.md) - `src/api/extension-contract.ts`: minimal extension/tool/UI/subagent host contracts shared with higher-level packages.
- [`agent/state/messages.md`](agent/state/messages.md) - `src/agent/state/messages.ts`: non-LLM agent message roles and `convertToLlm()` conversion.
- [`agent/runtime/types.md`](agent/runtime/types.md) - `src/agent/runtime/types.ts`: `Agent.run()` option and result types.
- [`node/index.md`](node/index.md) - `src/node/node.ts` and `src/node/*`: Node-only child-process, process-runtime, JSONL, path, and file-mutation queue helpers.
- [`node/env/nodejs.md`](node/env/nodejs.md) - `src/node/env/*`: `ExecutionEnv`, `FileSystem`, `Shell`, typed `Result`, `FileError`, `ExecutionError`, and `NodeExecutionEnv`.
- [`orchestrator/orchestrator.md`](orchestrator/orchestrator.md) - `src/orchestrator/orchestrator.ts`: dependency-aware task batching, scheduling strategies, and structured dependency handoffs.
- [`orchestrator/types.md`](orchestrator/types.md) - `src/orchestrator/types.ts`: orchestration config, scheduling, callbacks, and run-result types.
- [`task/types.md`](task/types.md) - `src/task/types.ts`: task input, snapshot, status, priority, memory scope, dependency-payload, and verification types.
- [`subagents/index.md`](subagents/index.md) - `src/subagents/*`: `SubagentManager`, durable record/request/result types, factory registry, progress tracking, and yield-result extraction.
- [`tools/registry.md`](tools/registry.md) - `src/tools/registry.ts` and `src/tools/policy.ts`: `createToolRegistry()`, `registerTools()`, and `Agent.registerTools()` for host-owned tools.

Legacy compatibility docs and docs for removed source modules are intentionally not retained.
