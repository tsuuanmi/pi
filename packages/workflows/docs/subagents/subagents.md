# Subagents and Workflow Tools

Workflow-owned subagent lifecycle tools and workflow-owned agent execution, plus the workflow-owned model-visible tool surface, registered by the workflow tool helper and package extension. Pi-native inspect, attach, and kill controls are registered by Pi separately.

**Source:** `src/extension.ts`, `src/tools.ts`, `src/subagents/manager.ts`, `src/subagents/surface.ts`, `src/subagents/tools.ts`, `src/skills/deep-interview/tools.ts`, `src/skills/ralplan/agent-adapter.ts`, `src/skills/ralplan/surface.ts`, `src/skills/ralplan/tools.ts`, `src/skills/team/agent-adapter.ts`, `src/skills/team/coordinator.ts`, `src/skills/team/surface.ts`, `src/skills/team/tools.ts`, `src/skills/ultragoal/surface.ts`, `src/skills/ultragoal/tools.ts`

## Model-Visible Tools

The workflow package extension registers these model-visible tools:

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
| `team_execute` | Execute the next legal Team worker, reviewer, or prover through the orchestrator. |
| `team_resume` | Resume Team execution from an orchestrator checkpoint. |
| `ultragoal_spawn_goal_agent` | Spawn the next legal Ultragoal goal worker. |

Direct `SubagentManager` calls are limited to workflow adapters: `src/subagents/tools.ts` for workflow lifecycle tools, `src/skills/team/agent-adapter.ts` for Team agents, `src/skills/ralplan/agent-adapter.ts` for Ralplan agents, and `src/skills/ultragoal/tools.ts` for one guarded goal worker. Ralplan and Team roles call the Orchestrator through workflow-owned adapters; the detached workflow owner is lifecycle-only. Workflows must use the Orchestrator for generic task dependencies, routing, retries, queues, or agent collaboration.

## Guarded Workflow Execution

- Ralplan computes the legal next role/stage from its run artifacts before `ralplan_run_agent` proceeds.
- Team computes the expected worker/reviewer/prover role before an execution tool proceeds and rejects off-sequence execution.
- Ultragoal computes the expected goal before `ultragoal_spawn_goal_agent` proceeds and rejects runtime model/tool overrides.

## Command Surface

`pi workflow ...` is the external CLI control plane for state, artifacts, gates, receipts, compaction, status, approval, and runtime owner lifecycle. It parses CLI input and returns command status/output; it does not invoke model-visible tools.

Model-visible tools are the separate in-process surface for the current Pi session. Tool implementations are skill-owned under `src/skills/<skill>/` or generic subagent tools under `src/subagents/`. `src/tools.ts` is the workflow tool contract and registration aggregator; it is not a second implementation directory.

When a command and a tool expose related behavior, both may call the same lower-level runtime or skill function. The command and tool adapters do not call each other.

## Command Layer Boundary

Generic `pi workflow subagent` / `subagents` command shims are removed. Spawn operations are model-visible tools, while external state and control-plane operations remain `pi workflow ...` commands. A command may use workflow RPC or a no-owner fallback, but that is runtime communication, not a tool call.

## See Also

- [Agents](../agents/agents.md)
- [Workflow control plane](../workflow.md)
- [Commands](../commands/workflow.md)
- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/pi/docs/subagents/index.md) - Pi-native SubagentManager
