# @tsuuanmi/pi-agent Documentation

`@tsuuanmi/pi-agent` contains the lower-layer agent runtime: the `Agent` class, the agent loop, shared message/tool/event types, proxy streaming, execution-environment abstractions, subagent contracts, and small Node-only utilities.

## Package entry points

- `@tsuuanmi/pi-agent` exports browser-safe/core APIs from `src/index.ts`.
- `@tsuuanmi/pi-agent/node` exports `NodeExecutionEnv` and Node-only process/file utilities from `src/node.ts`, plus the core APIs.

## Core APIs

- [Agent Loop](agent-loop.md) - `agentLoop()`, `agentLoopContinue()`, turn execution, tool execution, steering, follow-up, and abort handling.
- [Agent](agent.md) - `Agent` class, state management, event subscription, message queues, and lifecycle control.
- [Types](types.md) - `AgentMessage`, `AgentTool`, `AgentEvent`, `AgentContext`, tool result/update types, and loop option types.
- [Messages](harness/messages.md) - non-LLM harness message roles and `convertToLlm()` conversion.
- [Extension Contract](harness/extension-contract.md) - minimal extension/tool/UI/subagent host contracts shared with workflow packages.
- [Proxy Stream](proxy.md) - `streamProxy()` for routing LLM calls through a server proxy.
- [Observability](observability.md) - lifecycle events and instrumentation points emitted by `Agent` and the loop.

## Harness contracts and utilities

- [Execution Environment Types](harness/env/nodejs.md) - `ExecutionEnv`, `FileSystem`, `Shell`, typed `Result`, `FileError`, `ExecutionError`, and `NodeExecutionEnv`.
- [Subagents](harness/subagents.md) - `SubagentManager`, durable record/request/result types, factory registry, progress tracking, and yield-result extraction.
- [Shell Output](harness/utils/shell-output.md) - `executeShellWithCapture()` and binary-output sanitization.
- [Truncation](harness/utils/truncate.md) - `truncateHead()`, `truncateTail()`, `truncateLine()`, and truncation metadata.
- [Node Utilities](harness/utils/node.md) - Node-only child-process, JSONL, path, and file-mutation queue helpers.

## Historical docs

The following files are retained as compatibility notes for APIs that no longer live in `packages/agent/src`: [AgentHarness](harness/agent-harness.md), [Durable Harness](harness/durable-harness.md), [Hooks](harness/hooks.md), [Compaction](harness/compaction/compaction.md), [Session](harness/session/session.md), [Prompt Templates](harness/prompt-templates.md), [Skills](harness/skills.md), and [System Prompt](harness/system-prompt.md).
