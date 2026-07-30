## [Unreleased]

### Added

- **orchestrator**: Added `@tsuuanmi/pi-orchestrator` as the isolated package for task, team, and orchestrator contracts previously hosted in `@tsuuanmi/pi-agent`.

### Changed

- **orchestrator**: Replaced task requirement strings with structured hard requirements and added typed scheduling warnings.
- **orchestrator**: Made checkpoint save failures best-effort by default with an explicit strict policy.
- **orchestrator**: Added queue lifecycle events and single-task scheduling for incremental execution.
- **orchestrator**: Bumped checkpoints to version 6 with resume metadata and rich routing receipt metadata.