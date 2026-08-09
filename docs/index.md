# Repository documentation

Documentation is grouped by purpose:

## Requirements

- [Pi Workflow Task Lifecycle SRS](srs/pi-workflow-task-lifecycle-srs.md) - requirements for workflow contracts, subagents, and bounded tmux execution.

## Architecture decisions

- [Harness-Owned Task Contract Lifecycle ADR](adr/general-team-system-framework-adr.md) - runtime-owned lifecycle state, approval, and evidence.
- [Worktree and tmux Threat Model ADR](adr/tmux-worktree-threat-model-adr.md) - safety rules for Pi-owned tmux workers and deferred worktree isolation.

## Architecture notes

- [Package Overview](architecture/package-overview.md) - current package inventory, boundaries, dependencies, and runtime interactions
- [Runtime Lifecycle](architecture/runtime-lifecycle.md) - startup, session, turn, workflow, and shutdown flow
- [Package and Extension Authoring](architecture/package-and-extension-authoring.md) - package manifests, extension contracts, and authoring boundaries
- [Orchestrator vs. Workflows](architecture/orchestrator-vs-workflows.md)
- [Package Boundaries](architecture/package-boundaries.md)
- [Package Overlap Audit](architecture/package-overlap-audit.md)
- [Persistence Boundaries](architecture/persistence-boundaries.md)
- [Ralplan Orchestrator Contract](architecture/ralplan-orchestrator-contract.md)
- [Receipt Boundaries](architecture/receipt-boundaries.md)
- [Team Workflow Orchestrator Adapter](architecture/team-workflow-orchestrator-adapter.md)
- [Team Workflow Orchestrator Runtime](architecture/team-workflow-orchestrator-runtime.md)
- [Workflow Orchestrator Overlap](architecture/workflow-orchestrator-overlap.md)
