# Workflow Subagents

Generic and workflow-owned subagent spawning lives in the workflow extension and the skill harnesses.

**Source:** `src/harness/subagents/subagent-tools.ts`, `src/harness/ralplan/ralplan-tools.ts`, `src/harness/team/team-tools.ts`, `src/harness/ultragoal/ultragoal-tools.ts`, `src/extensions/workflows.ts`

## Model-Visible Tools

The extension registers these model-visible tools:

| Tool | Purpose |
|------|---------|
| `subagent_spawn` | Spawn a generic Pi-native subagent from an agent profile or overrides. |
| `subagent_status` | List or inspect durable subagent records. |
| `subagent_await` | Await a live subagent or read its terminal result. |
| `subagent_steer` | Steer a live/saved subagent. |
| `subagent_pause` | Pause a running subagent at a safe boundary. |
| `subagent_resume` | Resume a persistent saved subagent context. |
| `subagent_cancel` | Cancel a live or durable subagent record. |
| `ralplan_run_agent` | Run the next legal Ralplan role agent and persist role artifacts. |
| `team_spawn_task_agent` | Spawn the next legal Team task worker. |
| `ultragoal_spawn_goal_agent` | Spawn the next legal Ultragoal goal worker. |

All tools call the main session's `SubagentManager` in-process. The detached workflow owner is lifecycle-only and does not host spawns.

## Guarded Workflow Spawns

- Ralplan computes the legal next role/stage from its run artifacts before `ralplan_run_agent` proceeds.
- Team computes the expected task before `team_spawn_task_agent` proceeds and rejects runtime model/tool overrides.
- Ultragoal computes the expected goal before `ultragoal_spawn_goal_agent` proceeds and rejects runtime model/tool overrides.

## Command Layer Boundary

Generic `pi workflow subagent` / `subagents` command shims are removed. Spawn operations are model-visible tools; non-spawn workflow operations remain `pi workflow ...` commands.

## See Also

- [Agents](../../agents/agents.md)
- [Workflow control plane](../../workflow.md)
- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/subagents/subagents.md) - Pi-native SubagentManager
