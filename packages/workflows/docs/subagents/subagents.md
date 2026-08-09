# Subagent Tools and Workflow Tools

`@tsuuanmi/pi-agent` owns the reusable subagent contract and host-neutral lifecycle tool definitions. The workflow package owns the host adapter, workflow receipts, surface metadata, and workflow-specific agent execution. Pi-native inspect, attach, and kill controls remain registered by Pi separately.

**Sources:** `@tsuuanmi/pi-agent/src/subagents/`, `src/tool/adapter.ts`, `src/tool/subagent.ts`, `src/tool/register.ts`, `src/tool/surface.ts`, and skill modules under `src/skills/*/`.

## Ownership

- `@tsuuanmi/pi-agent`: `SubagentManager`, run/record/result types, thinking-level validation, progress, receipts, and host-neutral lifecycle tools.
- `src/tool/adapter.ts`: maps the required agent `SubagentContext` to `WorkflowContext` and wraps structured receipts in workflow receipts.
- `src/tool/subagent.ts`: registers the adapted core lifecycle definitions.
- `src/tool/surface.ts`: publishes workflow surface metadata derived from the agent tool definitions.
- `src/skills/*/`: owns workflow policy, role guards, artifact persistence, and orchestrator integration.
- `@tsuuanmi/pi`: owns Pi-native inspect, attach, and kill controls separately.

The workflow context keeps `subagents` optional because Pi can disable subagent support. The adapter checks that boundary before passing a required manager to an agent tool. Workflow code uses the injected `SubagentManager`; it does not construct or discover a second manager.

## Model-Visible Tools

The workflow extension registers these model-visible tools:

| Tool | Purpose |
|------|---------|
| `subagent_spawn` | Spawn a generic Pi-native subagent from an agent profile or overrides. |
| `subagent_status` | List or inspect durable subagent records. |
| `subagent_await` | Await a live subagent or read its terminal result. |
| `subagent_steer` | Steer a live or saved subagent. |
| `subagent_pause` | Pause a running subagent at a safe boundary. |
| `subagent_resume` | Resume a persistent saved subagent context. |
| `subagent_cancel` | Cancel a live or durable subagent record. |
| `deep_interview_plan_question` | Plan the next Deep Interview question and mark the workflow as waiting for an answer. |
| `deep_interview_record_answer` | Record or replace a Deep Interview answer shell, including optional topology lock. |
| `deep_interview_record_scoring` | Record scores, ambiguity, trigger metadata, and advisory counters for a round. |
| `deep_interview_closure_check` | Run the Deep Interview closure and acceptance guard. |
| `deep_interview_restate_goal` | Record the one-sentence restated goal confirmation or adjustment. |
| `deep_interview_write_spec` | Persist a finalized Deep Interview spec and optionally hand off to Ralplan, Ultragoal, or Team. |
| `ralplan_run_agent` | Run the next legal Ralplan role agent and persist role artifacts. |
| `team_execute` | Execute the next legal Team worker, reviewer, or prover through the orchestrator. |
| `team_resume` | Resume Team execution from an orchestrator checkpoint. |
| `ultragoal_spawn_goal_agent` | Spawn the next legal Ultragoal goal worker. |

Direct manager calls are limited to the workflow adapter and worker adapters: `src/tool/adapter.ts`, `src/skills/team/agent-adapter.ts`, `src/skills/ralplan/agent-adapter.ts`, and `src/skills/ultragoal/tools.ts`. Ralplan and Team roles call the Orchestrator through workflow-owned adapters; the detached workflow owner is lifecycle-only. Workflows must use the Orchestrator for generic task dependencies, routing, retries, queues, or agent collaboration.

## Guarded Workflow Execution

- Ralplan computes the legal next role/stage from its run artifacts before `ralplan_run_agent` proceeds.
- Team computes the expected worker/reviewer/prover role before a worker execution proceeds and rejects off-sequence execution.
- Ultragoal computes the expected goal before `ultragoal_spawn_goal_agent` proceeds and rejects runtime model/tool overrides.

## Context Boundary

Core lifecycle tools receive:

```typescript
interface SubagentContext {
  manager: SubagentManager;
  sessionId: string;
}
```

The workflow adapter constructs this required context from the optional `WorkflowContext.subagents` value. Core tools do not import workflow context or workflow receipt types. Workflow adapters add the workflow receipt envelope after core execution completes.

## Command Surface

`pi workflow ...` is the external CLI control plane for state, artifacts, gates, receipts, status, approval, and runtime owner lifecycle. It parses CLI input and returns command status/output; it does not invoke model-visible tools.

Model-visible tools are the separate in-process surface for the current Pi session. Agent-owned lifecycle tools are adapted under `src/tool/`; skill-specific tools remain under `src/skills/<skill>/`. `src/tool/spec.ts` and `src/tool/host.ts` define the workflow contract, while `src/tool/register.ts` aggregates registration.

When a command and a tool expose related behavior, both may call the same lower-level runtime or skill function. The command and tool adapters do not call each other.

## Command Layer Boundary

Generic `pi workflow subagent` / `subagents` command shims are removed. Spawn operations are model-visible tools, while external state and control-plane operations remain `pi workflow ...` commands. A command may use workflow RPC or a no-owner fallback, but that is runtime communication, not a tool call.

## See Also

- [Agents](../agents/agents.md)
- [Workflow control plane](../workflow.md)
- [Commands](../commands/workflow.md)
- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/pi/docs/subagents/index.md) - Pi-native `SubagentManager`
