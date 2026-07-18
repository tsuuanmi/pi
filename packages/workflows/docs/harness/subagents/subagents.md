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

## See Also

- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/subagents/subagents.md) - Pi-native SubagentManager
- [Team](../team/team.md) - Team workflow
- [Ultragoal](../ultragoal/ultragoal.md) - Ultragoal workflow
