# Harness Tool Surface

Workflow-owned spawn tools are registered by the workflow extension; non-spawn operations are `pi workflow ...` commands.

**Source:** `src/extensions/workflows.ts`, `src/subagents/subagent-tools.ts`, `src/skills/ralplan/ralplan-tools.ts`, `src/skills/team/team-tools.ts`, `src/skills/ultragoal/ultragoal-tools.ts`

## Model-Visible Tools

The current model-visible workflow tools are:

- Generic subagent lifecycle: `subagent_spawn`, `subagent_status`, `subagent_await`, `subagent_steer`, `subagent_pause`, `subagent_resume`, `subagent_cancel`.
- Guarded workflow spawns: `ralplan_run_agent`, `team_spawn_task_agent`, `team_spawn_review_agent`, `team_spawn_prover_agent`, `ultragoal_spawn_goal_agent`.

These tools call the main session's `SubagentManager` directly. They are not hosted by the detached runtime owner.

## Command Surface

Agents drive state, artifacts, gates, receipts, compaction, status, approval, and runtime owner lifecycle through `pi workflow ...` commands. The package has no generic workflow tools directory in the current source tree; tool implementations are either skill-owned under `src/skills/<skill>/` or generic subagent tools under `src/subagents/`.

## See Also

- [Subagents](../subagents/subagents.md)
- [Commands](../../commands/workflow.md)
- [Shared utilities](../shared/shared.md)
