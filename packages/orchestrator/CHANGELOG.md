## [Unreleased]

### Breaking Changes

- **subagents**: Moved the complete session-aware subagent API and implementation from `@tsuuanmi/pi`; consumers must import it from `@tsuuanmi/pi-orchestrator`.
- **orchestrator**: Replaced mixed task helper types with focused dependency graph contracts and removed internal prompt/result types from the package root.

### Added

- **subagents**: Added isolated Pi sessions, persistence, lifecycle/control tools, receipts, active HUD data, native/tmux backends, and the `subagent-worker` package command.
- **orchestrator**: Added `@tsuuanmi/pi-orchestrator` as the isolated package for task, team, and orchestrator contracts previously hosted in `@tsuuanmi/pi-agent`.

### Changed

- **orchestrator**: Split task graph, prompt formatting, execution failure, event, result, and verification responsibilities into focused modules.
- **orchestrator**: Replaced task requirement strings with structured hard requirements and added typed scheduling warnings.
- **orchestrator**: Made checkpoint save failures best-effort by default with an explicit strict policy.
- **orchestrator**: Added queue lifecycle events and single-task scheduling for incremental execution.
- **orchestrator**: Bumped checkpoints to version 6 with resume metadata and rich routing receipt metadata.

### Fixed

- **orchestrator**: Apply constructor-level trace and retry-classification hooks as run defaults.