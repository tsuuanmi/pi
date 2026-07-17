# Team Workflow

Runtime workflow for the team skill.

**Source:** `src/harness/team/`

## Overview

The team workflow manages the team coordination board, persisting state to `.pi/<session-id>/team/<team-id>/`. It tracks worker tasks, messages, and completion evidence.

## Module Structure

| Module | Description |
|--------|-------------|
| `team-runtime.ts` | Main runtime loop and task coordination |
| `team-tools.ts` | Tool definitions for team management |
| `team-hud.ts` | HUD rendering for team status |

## Coordination Model

The team workflow uses a shared board pattern:

1. **Coordinator** assigns tasks to worker subagents
2. Workers execute tasks independently and submit evidence
3. Coordinator reviews evidence and marks tasks as complete or requests revision
4. All state is persisted to the team directory for crash recovery

### State Files

| File | Description |
|------|-------------|
| `.pi/<session-id>/team/<teamId>/config.json` | Team coordination state |
| `.pi/<session-id>/team/<teamId>/tasks/` | Task definitions and evidence |
| `.pi/<session-id>/team/<teamId>/events.jsonl` | Event log |
| `.pi/<session-id>/team/<teamId>/mailbox/<recipient>.jsonl` | Per-recipient messages |

Note: Team state is stored under `.pi/<session-id>/team/`, scoped to the session that started the team run.

### TeamState

```typescript
interface TeamState {
  teamId: string;
  phase: TeamPhase;
  tasks: TeamTask[];
  startedAt: string;
  updatedAt: string;
}

interface TeamTask {
  id: string;
  title: string;
  description: string;
  assignee?: string;         // Subagent role
  status: TeamTaskStatus;
  evidence?: string;
  reviewNotes?: string;
}

type TeamTaskStatus = "pending" | "in_progress" | "submitted" | "complete" | "failed";
type TeamPhase = "planning" | "executing" | "reviewing" | "complete";
```

## Tools

The team workflow exposes tools for coordination:

- `team_spawn_task_agent` — Spawn a subagent for a task
- `team_submit_evidence` — Submit task completion evidence
- `team_review_evidence` — Review submitted evidence (coordinator)
- `team_update_task` — Update task status
- `team_send_message` — Send a message between tasks
- `team_get_status` — Get current team status

## Subagent Integration

Team workers are spawned via `team_spawn_task_agent`, which creates a subagent with:
- A task-specific system prompt
- The task description as the initial prompt
- A restricted tool set appropriate for the task
- Structured yield output on completion

The `syncWorkflowHudUi` function is called after state mutations to keep the interactive HUD in sync.

## See Also

- [Team Skill](../../skills/team/team.md) - Skill definition and SKILL.md
- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/subagents/subagents.md) - Pi-native SubagentManager
- [Shared Utilities](../shared/shared.md) - Common workflow utilities