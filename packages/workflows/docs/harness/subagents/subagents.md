# Subagent Workflow Control Plane

Workflow subagents use one canonical route: `pi workflow ...` commands. The old model-visible workflow subagent tools are not registered.

**Source:** `src/harness/runtime/owner.ts`, `src/commands/workflow.ts`

## Canonical Commands

- `pi workflow subagents <spawn|status|await|steer|pause|resume|cancel>` — generic subagent control-plane operations routed through the detached `RuntimeOwner` to the registered Pi `SubagentManager`.
- `pi workflow team spawn-task-agent` — state-guarded team worker spawn. The command computes the legal next team role from team state and refuses off-script task ids or runtime model/tool overrides.
- `pi workflow ultragoal spawn-goal-agent` — state-guarded ultragoal worker spawn. The command computes the legal next goal role from ultragoal state and refuses off-script goal ids or runtime model/tool overrides.
- `pi workflow ralplan run-agent` — state-guarded ralplan role-agent runner.

Subagent records persist under `.pi/<session-id>/state/subagents/` using the agent-layer record format.

## Guardrails

- Workflow-owned spawn commands are deterministic and fail closed on role mismatches.
- Runtime `model`, `thinkingLevel`, `tools`, and `excludeTools` overrides are rejected on guarded workflow-owned spawn paths.
- Generic `pi workflow subagents spawn` remains available for non-workflow-owned subagent operations.

## Current-Session Owner-Backed Spawning

- Subagent spawning is owner-backed: it requires a live runtime owner, and that owner must belong to the current workflow/interactive session. A live owner for a different session does not satisfy the spawn requirement.
- The current interactive Pi session is the owner context. Subagents are children managed by that session's runtime owner, not by a separate independent owner session. This keeps HUD updates, pause/cancel/status/await, and artifacts coherent under one session id.
- One-shot `pi workflow ...` CLI invocations do not construct a `SubagentManager` and have no live owner, so guarded spawn and `pi workflow ralplan run-agent` fail closed with `owner-not-live` (or `ralplan role agents require Pi-native subagents`) when run from outside a live session. This is expected behavior, not a bug.
- To run guarded spawns or role-agent passes, open/attach to the workflow session inside an interactive Pi runtime so the current-session owner is live.

## See Also

- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/subagents/subagents.md) - Pi-native SubagentManager
- [Team](../team/team.md) - Team workflow
- [Ultragoal](../ultragoal/ultragoal.md) - Ultragoal workflow
