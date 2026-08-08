# @tsuuanmi/pi-agent Documentation

`@tsuuanmi/pi-agent` contains the lower-layer standard agent runtime: the `Agent` class, the agent loop, shared message/tool/event types, explicit runtime/backend contracts, execution-environment abstractions, reusable subagent lifecycle behavior, and small Node-only utilities. Higher-level packages import these contracts, adapt host contexts, register host-specific tools, and attach UI/telemetry without reimplementing agent behavior.

## Package entry points

- `@tsuuanmi/pi-agent` exports browser-safe/core APIs from `src/index.ts`.
- `@tsuuanmi/pi-agent/node` exports `NodeExecutionEnv`, `ProcessRuntime`, and Node-only process/file utilities from `src/node/node.ts`.

## Standard package boundary

- `@tsuuanmi/pi-agent` owns agent behavior, runtime seams, message/event/tool contracts, shared subagent contracts, thinking-level validation, and host-neutral subagent lifecycle tools.
- `@tsuuanmi/pi-orchestrator` owns task, team, and orchestration contracts built on `Agent`.
- `@tsuuanmi/pi-ai` owns provider/model transport, streaming adapters, and the canonical `ThinkingLevel` type.
- Host packages such as `@tsuuanmi/pi` own concrete runtime tools and register them with `AgentTool` / `ToolRegistry` APIs; workflow packages own host adapters and workflow policy.
- Node-only runtimes and utilities are exported from `@tsuuanmi/pi-agent/node`.
- Protocol-specific integrations such as ACP should be implemented as `AgentRuntime` providers in the Node subpath or optional integration packages, not by adding protocol dependencies to the browser-safe core entry point.

This package intentionally differs from monolithic config-driven agents: it centralizes reusable behavior and contracts while keeping provider transport, concrete tools, and optional protocol backends pluggable.

## Documentation map

The docs tree follows the source domain folders under `packages/agent/src`, including agent behavior in `agent/` and message modeling in `messages/`.

- [`agent/index.md`](agent/index.md) - `src/agent/index.ts`: `Agent` class, state management, event subscription, message queues, and lifecycle control.
- [`agent/runtime/loop.md`](agent/runtime/loop.md) - `src/runtime/loop.ts`: `agentLoop()`, `agentLoopContinue()`, turn execution, tool execution, steering, follow-up, and abort handling.
- [`agent/runtime/events.md`](agent/runtime/events.md) - `src/runtime/events.ts`: lifecycle events and instrumentation points emitted by `Agent` and the loop.
- [`messages/messages.md`](messages/messages.md) - `src/messages/messages.ts`: non-LLM agent message roles and `convertToLlm()` conversion.
- [`agent/runtime/types.md`](agent/runtime/types.md) - `src/runtime/types.ts`: `Agent.run()` option and result types.
- [`node/index.md`](node/index.md) - `src/node/node.ts` and `src/node/*`: Node-only process, process-runtime, JSONL, path, and mutation-queue helpers.
- [`node/env/nodejs.md`](node/env/nodejs.md) - `src/node/env/*`: `ExecutionEnv`, `FileSystem`, `Shell`, typed `Result`, `FileError`, `ExecutionError`, and `NodeExecutionEnv`.
- [`subagents/index.md`](subagents/index.md) - `src/subagents/*`: `SubagentManager`, durable record/request/result types, thinking validation, lifecycle tools, factory registry, progress tracking, and yield-result extraction.
- [`tool/registry.md`](tool/registry.md) - `src/tool/registry.ts` and `src/tool/policy.ts`: `createToolRegistry()`, `registerTool()`, and `Agent.registerTool()` for host-owned tools.

Legacy compatibility docs and docs for removed source modules are intentionally not retained.
