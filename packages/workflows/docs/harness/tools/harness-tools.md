# Harness Tool Surface

The workflow package no longer registers workflow-owned model-visible harness tools.

**Source:** `src/commands/workflow.ts`, `src/harness/runtime/owner.ts`

## Canonical Route

Agents drive workflow state, artifacts, gates, receipts, and subagents through `pi workflow ...` control-plane commands. Deleted legacy tool modules under `src/harness/tools/` are intentionally not part of the public/model-visible surface.

## Subagents

Subagent lifecycle operations are routed through:

- `pi workflow subagents <spawn|status|await|steer|pause|resume|cancel>` for generic subagent control-plane operations.
- State-guarded workflow commands such as `pi workflow ralplan run-agent`, `pi workflow team spawn-task-agent`, and `pi workflow ultragoal spawn-goal-agent` for workflow-owned role spawns.

Structured subagent completion is handled by the Pi agent-layer `SubagentManager`; workflow code routes to it through the registered owner/factory seam rather than registering separate workflow tools.

## See Also

- [Subagents](../subagents/subagents.md) - Workflow subagent control plane
- [Shared Utilities](../shared/shared.md) - Shared workflow runtime utilities
