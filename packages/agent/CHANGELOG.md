## [0.2.2] - 2026-07-23

### Added

- **tools**: Added `createAgentToolRegistry()`, `registerAgentTools()`, and `Agent.registerTools()` as the standard registration seam for host-owned tool implementations.
- **receipts**: Added `StructuredReceipt` helpers for attaching and validating machine-readable execution receipts.
- **subagents**: Added shared subagent receipt/type exports, including `SubagentStatus`, `SubagentBackendKind`, `SubagentControlAction`, tmux metadata in `receipt.meta`, and the `visibility` contract (`native`, `tmux`, `auto`) for subagent run requests.
- **subagents**: Added shared inspect, attach, and kill result types to the `SubagentManager` contract.
- **subagents**: Added the shared `Subagent Run Identity` JSON schema and typed helpers for tmux-backed subagent owner/session/target metadata.

### Breaking Changes

- **extensions**: Renamed the extension context continuation-skip flag to `skipAutomaticContinuation` so the lower-layer contract stays feature-agnostic.
- **tools**: Moved concrete Pi built-in tool helpers for edit diffing, path resolution, bounded output accumulation, shell-output capture, and truncation out of `@tsuuanmi/pi-agent` and into `@tsuuanmi/pi`; `@tsuuanmi/pi-agent` now owns only the generic tool protocol and registration APIs.
- **agent**: Moved the remaining shared source modules out of `src/harness/` into top-level `src/env`, `src/subagents`, `src/utils`, and `src/messages.ts` paths; no `src/harness/` compatibility wrappers are provided.

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
