# Subagents and Workflow Tools

Generic and workflow-owned subagent spawning, plus the workflow-owned model-visible tool surface, registered by the workflow extension.

**Source:** `src/subagents/subagent-tools.ts`, `src/skills/deep-interview/deep-interview-tools.ts`, `src/skills/ralplan/ralplan-tools.ts`, `src/skills/team/team-tools.ts`, `src/skills/ultragoal/ultragoal-tools.ts`, `src/extensions/workflows.ts`

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
| `deep_interview_plan_question` | Plan the next Deep Interview question and mark the workflow as waiting for an answer. |
| `deep_interview_record_answer` | Record or replace a Deep Interview answer shell, including optional topology lock. |
| `deep_interview_record_scoring` | Record scores, ambiguity, trigger metadata, and advisory counters for a round. |
| `deep_interview_read_compact` | Read a compact Deep Interview state projection for resume or prompt budgeting. |
| `deep_interview_closure_check` | Run the Deep Interview closure and acceptance guard. |
| `deep_interview_restate_goal` | Record the one-sentence restated goal confirmation or adjustment. |
| `deep_interview_write_spec` | Persist a finalized Deep Interview spec and optionally hand off to ralplan, ultragoal, or team. |
| `ralplan_run_agent` | Run the next legal Ralplan role agent and persist role artifacts. |
| `team_spawn_task_agent` | Spawn the next legal Team task worker. |
| `team_spawn_review_agent` | Spawn the next legal Team task reviewer. |
| `team_spawn_prover_agent` | Spawn the next legal Team completion prover. |
| `ultragoal_spawn_goal_agent` | Spawn the next legal Ultragoal goal worker. |

All tools call the main session's `SubagentManager` in-process. The detached workflow owner is lifecycle-only and does not host spawns.

## Guarded Workflow Spawns

- Ralplan computes the legal next role/stage from its run artifacts before `ralplan_run_agent` proceeds.
- Team computes the expected worker/reviewer/prover role before a team spawn tool proceeds and rejects runtime model/tool overrides.
- Ultragoal computes the expected goal before `ultragoal_spawn_goal_agent` proceeds and rejects runtime model/tool overrides.

## Command Surface

Agents drive state, artifacts, gates, receipts, compaction, status, approval, and runtime owner lifecycle through `pi workflow ...` commands. Tool implementations are skill-owned under `src/skills/<skill>/` (workflow-owned interview and spawn tools) or generic subagent tools under `src/subagents/`. The package has no separate generic workflow tools directory in the current source tree.

## Command Layer Boundary

Generic `pi workflow subagent` / `subagents` command shims are removed. Spawn operations are model-visible tools; non-spawn workflow operations remain `pi workflow ...` commands.

## See Also

- [Agents](../agents/agents.md)
- [Workflow control plane](../workflow.md)
- [Commands](../commands/workflow.md)
- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/pi/docs/core/subagents/subagents.md) - Pi-native SubagentManager
