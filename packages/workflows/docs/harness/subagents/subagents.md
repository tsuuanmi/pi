# Subagent Workflow Tools

Workflow-specific tool definitions for spawning and managing subagent sessions within team and ultragoal workflows.

**Source:** `src/harness/subagents/`

## Overview

The `subagent-tools.ts` module provides the `team_spawn_task_agent` and `ultragoal_spawn_goal_agent` tool definitions used by the team and ultragoal workflows to spawn subagent workers.

These tools reuse the parent session's `SubagentManager` so that spawned workers appear in `state/subagents/index.jsonl` and can be inspected with `subagent_status`/`subagent_await`.

## Tools

### team_spawn_task_agent

Spawns a subagent to execute a team task.

```jsonc
{
  "teamId": "team-abc",
  "taskId": "task-1",
  "agent": "worker",              // optional: defaults to "worker"
  "model": "anthropic/claude-...", // optional: model override
  "thinkingLevel": "medium",      // optional: thinking level override
  "tools": ["read", "bash"],      // optional: allowed tool names
  "excludeTools": ["subagent_spawn"] // optional: tool names to exclude
}
```

After spawning, `syncWorkflowHudUi` is called to update the interactive HUD.

### ultragoal_spawn_goal_agent

Spawns a subagent to execute an ultragoal goal.

```jsonc
{
  "goalId": "goal-1",
  "agent": "worker",              // optional: defaults to "worker"
  "model": "anthropic/claude-...", // optional: model override
  "thinkingLevel": "medium",      // optional: thinking level override
  "tools": ["read", "bash"],      // optional: allowed tool names
  "excludeTools": ["subagent_spawn"] // optional: tool names to exclude
}
```

After spawning, `syncWorkflowHudUi` is called to update the interactive HUD.

## Nesting Guard

Both tools filter out `subagent_spawn` and other subagent tools from the spawned subagent's tool set, enforcing the nesting guard described in the [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/subagents/subagents.md) documentation.

## See Also

- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/subagents/subagents.md) - Pi-native SubagentManager and seven subagent tools
- [Team](../team/team.md) - Team workflow
- [Ultragoal](../ultragoal/ultragoal.md) - Ultragoal workflow