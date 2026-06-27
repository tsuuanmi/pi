# @tsuuanmi/pi-agent Documentation

Agent loop, harness, session management, and observability for the Pi agent framework.

## Top-level modules

- [Agent Loop](agent-loop.md) - `agentLoop()`, `agentLoopContinue()`, turn execution, abort handling, steering, and follow-up queues.
- [Agent](agent.md) - `Agent` class, state management, event subscription, message queuing, and `AgentState`.
- [Types](types.md) - `AgentMessage`, `AgentTool`, `AgentEvent`, `AgentContext`, and all type definitions.
- [Proxy Stream](proxy.md) - `streamProxy()` for routing LLM calls through a server proxy.

## Harness

- [AgentHarness Lifecycle](harness/agent-harness.md) - Harness orchestration, state model, operation phases, and turn execution.
- [Durable Harness](harness/durable-harness.md) - Durable session design, recovery model, and what the harness persists.
- [Hooks](harness/hooks.md) - Hook types, mutation semantics, extension loading, and context transforms.
- [Compaction](harness/compaction/compaction.md) - Context compaction, branch summarization, `shouldCompact()`, `compact()`, `prepareCompaction()`.
- [Session](harness/session/session.md) - `Session` class, tree-structured entries, JSONL and memory storage, `buildSessionContext()`.
- [Messages](harness/messages.md) - `CustomMessage`, `BranchSummaryMessage`, `CompactionSummaryMessage`, `convertToLlm()`.
- [Prompt Templates](harness/prompt-templates.md) - Slash-command prompts, frontmatter loading, argument substitution.
- [Skills](harness/skills.md) - Skill loading and invocation formatting.
- [System Prompt](harness/system-prompt.md) - `formatSkillsForSystemPrompt()`.
- [Node.js Environment](harness/env/nodejs.md) - `NodeExecutionEnv` for filesystem and shell operations.
- [Shell Output](harness/utils/shell-output.md) - `executeShellWithCapture()`, `sanitizeBinaryOutput()`, `TruncationResult`.
- [Truncation](harness/utils/truncate.md) - `truncateHead()`, `truncateTail()`, `truncateLine()`.

## Cross-cutting

- [Observability](observability.md) - Structured lifecycle events, async context, runtime adapters, and instrumentation points.