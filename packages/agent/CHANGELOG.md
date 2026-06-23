## [Unreleased]

### Breaking Changes

- Removed Windows-specific shell discovery and process-tree termination paths from the Node execution harness.
- Removed the `thinkingBudgets` option from `Agent`, `AgentOptions`, and the proxy serializable stream options (token-based thinking budgets were removed from `@tsuuanmi/pi-ai`).

## [0.79.6] - 2026-06-16

## [0.79.5] - 2026-06-16

## [0.79.4] - 2026-06-15

## [0.79.3] - 2026-06-13

## [0.79.2] - 2026-06-12

### Fixed

- Fixed late tool progress callbacks after tool settlement to be ignored instead of emitting stale `tool_execution_update` events ([#5573](https://github.com/earendil-works/pi/issues/5573)).

## [0.79.1] - 2026-06-09

## [0.79.0] - 2026-06-08

### Fixed

- Fixed the compaction summarization system prompt to use neutral AI assistant wording for non-coding agents ([#5401](https://github.com/earendil-works/pi/issues/5401)).

## [0.78.1] - 2026-06-04
