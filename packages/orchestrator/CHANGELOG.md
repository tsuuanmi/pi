## [Unreleased]

### Breaking Changes

- **subagent**: Moved the complete session-aware subagent API and implementation from `@tsuuanmi/pi`; consumers must import it from `@tsuuanmi/pi-orchestrator`.
- **orchestrator**: Replaced mixed task helper types with focused dependency graph contracts and removed internal prompt/result types from the package root.

### Added

- **subagent**: Added isolated Pi sessions, persistence, lifecycle tools, durable inspection, receipts, and active HUD data.
- **orchestrator**: Added `@tsuuanmi/pi-orchestrator` as the isolated package for task, team, and orchestrator contracts previously hosted in `@tsuuanmi/pi-agent`.

### Changed

- **orchestrator**: Split task graph, prompt formatting, execution failure, event, result, and verification responsibilities into focused modules.
- **orchestrator**: Replaced task requirement strings with structured hard requirements and added typed scheduling warnings.
- **orchestrator**: Made checkpoint save failures best-effort by default with an explicit strict policy.
- **orchestrator**: Added queue lifecycle events and single-task scheduling for incremental execution.
- **orchestrator**: Bumped checkpoints to version 6 with resume metadata and rich routing receipt metadata.

### Removed

- **subagent**: Removed the tmux execution backend, worker command, attach/kill controls, and tmux run-identity metadata; native execution and durable inspection are now authoritative.

### Fixed

- **orchestrator**: Apply constructor-level trace and retry-classification hooks as run defaults.
