## [Unreleased]

### Breaking Changes

- Removed unused coding-agent harness APIs from the public package surface, including `AgentHarness`, harness compaction/session/skills/prompt-template/system-prompt exports, harness repository helpers, `uuidv7`, and harness-specific error types. Use `@tsuuanmi/pi-coding-agent` for coding-agent application features.
- Removed Windows-specific shell discovery and process-tree termination paths from the Node execution harness.
- Removed the `thinkingBudgets` option from `Agent`, `AgentOptions`, and the proxy serializable stream options (token-based thinking budgets were removed from `@tsuuanmi/pi-ai`).

### Fixed

- Aligned shared truncation line counting with coding-agent behavior so trailing newlines are not counted as extra output lines.

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

- Fixed the compaction summarization system prompt to use neutral AI assistant wording for non-coding agents ([#5401](https://github.com/tsuuanmi/pi/issues/5401)).

## [0.78.1] - 2026-06-04
