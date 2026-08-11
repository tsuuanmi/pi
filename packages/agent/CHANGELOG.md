## [Unreleased]

### Breaking Changes

- **stream**: Renamed the public `StreamFn` contract to `StreamFunction` and the agent stream injection property to `stream`.
- **agent**: Renamed `AgentContext` to `Context` and `RuntimeClock` to `Clock`, without compatibility aliases.
- **agent**: Renamed the agent-owned `Message` type to `AgentMessage` to distinguish it from the LLM protocol `Message` in `@tsuuanmi/pi-ai`, without a compatibility alias.
- **agent**: Removed public runtime and backend contracts; `Agent` now owns the internal model/tool loop.
- **events**: Renamed `runtime_trace`/`runtime_warning` events to `trace`/`warning`.
- **subagents**: Removed the unused `SubagentManagerFactory` registry; concrete hosts construct and inject managers directly.
- **node**: Added the byte-preserving `runProcess()` API, changed Node shell resolution to fail when Bash is unavailable, and changed execution results to preserve `null` signal exits.
- **tool**: Renamed structured tool receipt helpers from built-in-specific names to standard protocol names and changed receipt sources to generic `tool` and `session` values.
- **extensions**: Removed the shared extension contract surface from `@tsuuanmi/pi-agent`; the public Pi extension API now owns extension hook registration and actions.
- **hooks**: Replaced the individual `AgentOptions` lifecycle and tool hook callbacks with named `AgentHook` registrations through `Agent.registerHook()`.
- **tool**: Replaced the split tool interfaces and helper functions with `Tool`, `ToolSpec`, and `ToolRegistry`; agents now manage active tools through `Agent.setTools()` and `Agent.getTools()`.
- **team**: Replaced the positional `Team` constructor with `new Team({ name, agents })`.
- **task**: Replaced legacy sequential task IDs and permissive task metadata/dependency handling with UUID-backed IDs, strict metadata validation/redaction, skipped lifecycle state, and fail-fast dependency validation.
- **orchestrator**: Moved task, team, and orchestrator contracts out of `@tsuuanmi/pi-agent` into `@tsuuanmi/pi-orchestrator`.
- **orchestrator**: Standardized orchestrator options on `schedulingStrategy` and `abortSignal`, removed `runTeam`, removed `onTaskFail`, removed scheduler fallback assignment, and made explicit task assignees fail fast when they do not match the team roster.
- **subagents**: Removed tmux command fallback; invalid identity returns `invalid_identity` and missing tmux commands return `invalid_metadata`.
- **subagents**: Removed all subagent contracts, lifecycle tools, persistence, tmux, and run-identity modules; session-aware subagents are owned by `@tsuuanmi/pi-orchestrator`.
- **model**: Re-exported canonical `Api`, `Model`, and `ThinkingLevel` types and `isValidThinkingLevel` for generic agent consumers.
- **jsonl**: `attachJsonlLineReader()` now requires an error callback and rejects CRLF or unterminated records.

### Added

- **agent**: Made `Agent.dispose()` terminal and idempotent, and rejected new work after disposal.
- **agent**: Added `ToolAccessPolicy` and `ToolSelectionPolicy` helpers for shared tool gating and active-tool resolution.
- **agent**: Added a `maxTurns` guard for graceful agent-loop termination before runaway provider calls.
- **agent**: Added deterministic loop clock/request-id hooks and bounded parallel tool execution with `maxToolConcurrency`.
- **agent**: Added opt-in tool output limits with deterministic truncation markers.
- **agent**: Added provider request timeouts for deterministic stream aborts.
- **agent**: Added structured tool execution metadata for final tool events.
- **agent**: Added request and tool trace spans for agent observability.
- **tool**: Added `Tool.define()` for validated TypeBox-native tool declarations.
- **tool**: Added `ContextToolSpec` as the canonical host-context extension of `ToolSpec`.
- **thinking**: Added centralized `parseThinkingLevel()` validation for Agent consumers.
- **tool**: Added opt-in TypeBox validation for tool result details.
- **agent**: Added context-pruning helpers for sliding-window transforms that preserve assistant tool calls with matching tool results.
- **agent**: Added isolated `run()`, state/history accessors, lifecycle run hooks, status tracing events, capabilities, and per-agent task serialization.
- **hooks**: Added ordered, disposable `AgentHook` registrations with isolated-run propagation and typed tool/turn hook composition.
- **orchestrator**: Added strict goal-to-DAG planning with explicit coordinator agents, exact dependency preservation, abortable planning, plan-time cycle rejection, dependency-aware pipelining, composite scheduling, structured dependency handoffs, task priority ordering, and retry-aware task execution.
- **orchestrator**: Added progress events, trace hooks, dispatch gating, abort-aware retry delays, aborted run status, per-task execution metrics, coarse run budgets with in-flight timeout aborts, validated checkpoint resume support, task verification hooks, strict consensus verification helpers, and failure-policy short-circuiting.
- **orchestrator**: Added explicit run identity correlation across events, traces, checkpoints, and run results with version 2 checkpoint schema validation.
- **orchestrator**: Added a dedicated routing boundary with `TaskRoutingDecision` payloads emitted before dispatch approval and task execution.
- **orchestrator**: Added retry classification metadata for retry traces and receipts with explicit hook-driven classification.
- **orchestrator**: Added version 4 run facts to run results and checkpoints with strict resume validation for team, roster, and task ids.
- **orchestrator**: Added execution receipts across run results and checkpoints for structured per-task observability.
- **orchestrator**: Added an explicit consequential-task approval boundary with `task_consequential` traces and `onTaskConsequential` hooks.
- **orchestrator**: Hardened retry handling with structured jittered retry decisions and retry trace payloads.
- **orchestrator**: Fixed verification failure metrics to record the real task start time, prevented duplicate `budget_exceeded` events after timer-driven aborts, kept checkpoint writes recoverable after a save failure, made only `running` checkpoints resumable, emitted a dedicated checkpoint-save failure trace, and removed duplicate task-dispatch tracing when approval hooks are enabled.
- **task**: Added richer task metadata for memory scope, priority, retry settings, role hints, and verification payloads.
- **team**: Added inter-agent messaging, message snapshots, subscriptions, and typed team events.
- **attribution**: Added MIT attribution for the open-multi-agent architecture.

### Changed

- **agent**: Use the canonical message conversion path for the default provider context.
- **progress**: Omit incomplete tool diagnostics instead of emitting placeholder values.
- **receipts**: Omit unavailable subagent visibility and failure metadata from structured receipts.
- **agent**: Flattened core agent source modules from `src/agent/*` into `src/*`.
- **agent**: Renamed long internal source filenames to concise module names such as `structured-output`, `loop-detector`, and `mutation-queue`.
- **agent**: Grouped agent behavior under `src/agent/`, message logic under `src/messages/`, and shared receipt metadata under `src/metadata/` with standard tool receipt builders under `src/tool/`.
- **tool**: Tool registries now fail fast on duplicate tool names; use explicit replacement when changing an existing tool.

### Fixed

- **docs**: Reorganized package docs to mirror `src/`, removed legacy/unused docs, and updated package, agent, tool, and observability docs to reflect the current `Agent` boundary and tool registration.
- **exports**: Restored shared public exports from `@tsuuanmi/pi-agent`, including structured receipt helpers and the Node helper subpath.
- **agent**: Waited for lifecycle event consumers before continuing tool execution, preserving persisted event order.
- **pi**: Centralized active-tool selection in the shared tool policy helpers.

## [0.2.2] - 2026-07-23

### Added

- **tool**: Added `createToolRegistry()`, `registerTool()`, and `Agent.registerTool()` as the standard registration seam for host-owned tool implementations.
- **receipts**: Added `StructuredReceipt` helpers for attaching and validating machine-readable execution receipts.
- **subagents**: Added shared subagent receipt/type exports, including `SubagentStatus`, `SubagentBackendKind`, `SubagentControlAction`, tmux metadata in `receipt.meta`, and the `visibility` contract (`native`, `tmux`, `auto`) for subagent run requests.
- **subagents**: Added shared inspect, attach, and kill result types to the `SubagentManager` contract.
- **subagents**: Added the shared `Subagent Run Identity` JSON schema and typed helpers for tmux-backed subagent owner/session/target metadata.

### Breaking Changes

- **extensions**: Renamed the extension context continuation-skip flag to `skipAutomaticContinuation` so the lower-layer contract stays feature-agnostic.
- **tool**: Moved concrete Pi built-in tool helpers for edit diffing, path resolution, bounded output accumulation, shell-output capture, and truncation out of `@tsuuanmi/pi-agent` and into `@tsuuanmi/pi`; `@tsuuanmi/pi-agent` now owns only the generic tool protocol and registration APIs.
- **agent**: Moved the remaining shared source modules out of `src/harness/` into focused `src/agent`, `src/subagents`, `src/node`, and `src/agent/state` paths; no `src/harness/` compatibility wrappers are provided.

## [0.2.0] - 2026-07-20

### Added

- **subagents**: Added a `SubagentManagerFactory` registry (`registerSubagentManagerFactory`/`getSubagentManagerFactory`/`clearSubagentManagerFactoryForTests`) + `SubagentManagerFactoryContext` type as the registration seam that lets higher-level packages obtain a `SubagentManager` without depending on `pi`. Added `dispose(): Promise<void>` to the `SubagentManager` interface for owner-lifecycle teardown.

### Breaking Changes

- Removed unused pi harness APIs from the public package surface, including `AgentHarness`, harness compaction/session/skills/prompt-template/system-prompt exports, harness repository helpers, `uuidv7`, and harness-specific error types. Use `@tsuuanmi/pi` for pi application features.
- Removed Windows-specific shell discovery and process-tree termination paths from the Node execution harness.
- Removed the `thinkingBudgets` option from `Agent`, `AgentOptions`, and the proxy serializable stream options (token-based thinking budgets were removed from `@tsuuanmi/pi-ai`).

### Fixed

- Aligned shared truncation line counting with pi behavior so trailing newlines are not counted as extra output lines.

## [0.79.6] - 2026-06-16

## [0.79.5] - 2026-06-16

## [0.79.4] - 2026-06-15

## [0.79.3] - 2026-06-13

## [0.79.2] - 2026-06-12

### Fixed

- Fixed late tool progress callbacks after tool settlement to be ignored instead of emitting stale `tool_execution_update` events ([#5573](https://github.com/tsuuanmi/pi/issues/5573)).

## [0.79.1] - 2026-06-09

## [0.79.0] - 2026-06-08

### Fixed

- Fixed the compaction summarization system prompt to use neutral AI assistant wording for non-code-focused agents ([#5401](https://github.com/tsuuanmi/pi/issues/5401)).

## [0.78.1] - 2026-06-04
