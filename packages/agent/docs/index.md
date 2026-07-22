# @tsuuanmi/pi-agent Documentation

`@tsuuanmi/pi-agent` contains the lower-layer agent runtime: the `Agent` class, the agent loop, shared message/tool/event types, proxy streaming, execution-environment abstractions, subagent contracts, and small Node-only utilities.

## Package entry points

- `@tsuuanmi/pi-agent` exports browser-safe/core APIs from `src/index.ts`.
- `@tsuuanmi/pi-agent/node` exports `NodeExecutionEnv` and Node-only process/file utilities from `src/node.ts`, plus the core APIs.

## Core APIs

- [Agent Loop](agent-loop.md) - `agentLoop()`, `agentLoopContinue()`, turn execution, tool execution, steering, follow-up, and abort handling.
- [Agent](agent.md) - `Agent` class, state management, event subscription, message queues, and lifecycle control.
- [Types](types.md) - `AgentMessage`, `AgentTool`, `AgentEvent`, `AgentContext`, tool result/update types, and loop option types.
- [Messages](messages.md) - non-LLM agent message roles and `convertToLlm()` conversion.
- [Extension Contract](extension-contract.md) - minimal extension/tool/UI/subagent host contracts shared with workflow packages.
- [Proxy Stream](proxy.md) - `streamProxy()` for routing LLM calls through a server proxy.
- [Observability](observability.md) - lifecycle events and instrumentation points emitted by `Agent` and the loop.

## Shared contracts and utilities

- [Execution Environment Types](env/nodejs.md) - `ExecutionEnv`, `FileSystem`, `Shell`, typed `Result`, `FileError`, `ExecutionError`, and `NodeExecutionEnv`.
- [Subagents](subagents.md) - `SubagentManager`, durable record/request/result types, factory registry, progress tracking, and yield-result extraction.
- [Shell Output](utils/shell-output.md) - `executeShellWithCapture()` and binary-output sanitization.
- [Truncation](utils/truncate.md) - `truncateHead()`, `truncateTail()`, `truncateLine()`, and truncation metadata.
- [Node Utilities](utils/node.md) - Node-only child-process, JSONL, path, and file-mutation queue helpers.

## Historical docs

The following files are retained as compatibility notes for APIs that no longer live in `packages/agent/src`: [AgentHarness](legacy/agent-harness.md), [Durable Harness](legacy/durable-harness.md), [Hooks](legacy/hooks.md), [Compaction](legacy/compaction.md), [Session](legacy/session.md), [Prompt Templates](legacy/prompt-templates.md), [Skills](legacy/skills.md), and [System Prompt](legacy/system-prompt.md).
