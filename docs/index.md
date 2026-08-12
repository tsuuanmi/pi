# Repository documentation

Documentation is grouped by purpose:

## Requirements

- [Pi Workflow Task Lifecycle SRS](srs/pi-workflow-task-lifecycle-srs.md) - requirements for workflow contracts, subagents, and bounded tmux execution.

## Architecture decisions

- [Harness-Owned Task Contract Lifecycle ADR](adr/general-team-system-framework-adr.md) - runtime-owned lifecycle state, approval, and evidence.
- [Worktree and tmux Threat Model ADR](adr/tmux-worktree-threat-model-adr.md) - safety rules for Pi-owned tmux workers and deferred worktree isolation.

## Architecture notes

- [Package Overview](architecture/package-overview.md) - big-picture inventory, dependency graph, runtime interactions, and links to detailed component maps
  - [AI package](architecture/packages/ai.md)
  - [Agent package](architecture/packages/agent.md)
  - [Orchestrator package](architecture/packages/orchestrator.md)
  - [TUI package](architecture/packages/tui.md)
  - [Workflows package](architecture/packages/workflows.md)
  - [Pi package](architecture/packages/pi.md)
- [Component Integration Map](architecture/component-integration-map.md) - canonical component owners and exact static-import, dynamic-load, injection, data-handoff, and bundling paths
- [Runtime Lifecycle](architecture/runtime-lifecycle.md) - startup, session, turn, workflow, and shutdown flow
- [Package and Extension Authoring](architecture/package-and-extension-authoring.md) - package manifests, extension contracts, and authoring boundaries
- [Orchestrator vs. Workflows](architecture/orchestrator-vs-workflows.md)
- [Package Boundaries](architecture/package-boundaries.md)
- [Package Overlap Audit](architecture/package-overlap-audit.md) - intentional adapters, duplicate/ambiguous seams, forbidden duplication, and cleanup priorities
- [Package Overlap Implementation](architecture/package-overlap-implementation.md) - phased file-level changes, dependency order, and verification gates
- [Subagent to Orchestrator Migration](architecture/subagent-to-orchestrator-migration.md) - implemented ownership, composition, and dependency changes
- [Persistence Boundaries](architecture/persistence-boundaries.md)
- [Ralplan Orchestrator Contract](architecture/ralplan-orchestrator-contract.md)
- [Receipt Boundaries](architecture/receipt-boundaries.md)
- [Team Workflow Orchestrator Adapter](architecture/team-workflow-orchestrator-adapter.md)
- [Team Workflow Orchestrator Runtime](architecture/team-workflow-orchestrator-runtime.md)
- [Workflow Orchestrator Overlap](architecture/workflow-orchestrator-overlap.md)
