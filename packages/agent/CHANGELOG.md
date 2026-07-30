## [Unreleased]

### Breaking Changes

- **extensions**: Removed the shared extension contract surface from `@tsuuanmi/pi-agent`; the public Pi extension API now owns extension hook registration and actions.
- **agent**: Collapsed the split simple/runtime Agent surface into one public runtime-capable `Agent`; `RuntimeAgent` is no longer exported.
- **agent**: Standardized custom runtimes on `AgentRuntime.stream()` and removed split `runPrompt()`/`continue()` runtime methods.
- **agent**: Standardized the public tool module on `src/tool`, with `createToolRegistry()`, `registerTool()`, `Agent.registerTool()`, and `RegisterToolOptions`.
- **node**: Renamed the process runtime public API to `ProcessRuntime` and `ProcessRuntimeOptions`.
- **team**: Replaced the positional `Team` constructor with `new Team({ name, agents })`.
- **task**: Replaced legacy sequential task IDs and permissive task metadata/dependency handling with UUID-backed IDs, strict metadata validation/redaction, skipped lifecycle state, and fail-fast dependency validation.
- **orchestrator**: Moved task, team, and orchestrator contracts out of `@tsuuanmi/pi-agent` into `@tsuuanmi/pi-orchestrator`.
- **orchestrator**: Standardized orchestrator options on `schedulingStrategy` and `abortSignal`, removed `runTeam`, removed `onTaskFail`, removed scheduler fallback assignment, and made explicit task assignees fail fast when they do not match the team roster.

### Added

- **agent**: Added `AgentBackend` and `AgentRuntime` as the standard execution seam for swapping the built-in loop with external backends.
- **agent**: Added optional runtime teardown via `Agent.dispose()` and `AgentRuntime.dispose()` for external backend cleanup.
- **agent**: Added `AgentRuntime.stream()` as the backend seam for prompt and continuation runs, with runtime event, done, and error stream events.
- **agent**: Added `RunResult` for structured runtime completion metadata, backend metadata, warnings, traces, and loop/max-turn flags.
- **node**: Added `ProcessRuntime` as the standard Node process backend seam.
- **agent**: Added `ToolAccessPolicy` and `ToolSelectionPolicy` helpers for shared tool gating and active-tool resolution.
- **agent**: Added a `maxTurns` guard for graceful agent-loop termination before runaway provider calls.
- **agent**: Added context-pruning helpers for sliding-window transforms that preserve assistant tool calls with matching tool results.
- **agent**: Added isolated `run()`, state/history accessors, lifecycle run hooks, status tracing events, capabilities, and per-agent task serialization.
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

### Fixed

- **docs**: Reorganized package docs to mirror `src/`, removed legacy/unused docs, and updated package, agent, tool, and observability docs to reflect the current `AgentOptions`, runtime seam, tool registration, and optional protocol-runtime boundaries.
- **exports**: Restored shared public exports from `@tsuuanmi/pi-agent`, including structured receipt helpers and the Node helper subpath.
- **agent**: Split the monolithic agent type module into focused runtime, task, and orchestrator type modules, and moved message helpers under agent state.
- **agent**: Refactored the public `Agent` to route prompt and continuation execution through the new runtime seam without changing behavior.
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
