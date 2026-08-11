## [Unreleased]

### Breaking Changes

- **orchestrator**: Replaced mixed task helper types with focused dependency graph contracts and removed internal prompt/result types from the package root.

### Added

- **orchestrator**: Added `@tsuuanmi/pi-orchestrator` as the isolated package for task, team, and orchestrator contracts previously hosted in `@tsuuanmi/pi-agent`.

### Changed

- **orchestrator**: Split task graph, prompt formatting, execution failure, event, result, and verification responsibilities into focused modules.
- **orchestrator**: Replaced task requirement strings with structured hard requirements and added typed scheduling warnings.
- **orchestrator**: Made checkpoint save failures best-effort by default with an explicit strict policy.
- **orchestrator**: Added queue lifecycle events and single-task scheduling for incremental execution.
- **orchestrator**: Bumped checkpoints to version 6 with resume metadata and rich routing receipt metadata.

### Fixed

- **orchestrator**: Apply constructor-level trace and retry-classification hooks as run defaults.