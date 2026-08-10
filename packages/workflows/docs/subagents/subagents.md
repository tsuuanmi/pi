# Workflow and Subagent Integration

`@tsuuanmi/pi` owns the complete session-aware subagent boundary. A Pi subagent wraps the generic `Agent` from `@tsuuanmi/pi-agent` with an isolated `AgentSession`, persistence, resource loading, lifecycle controls, and native/tmux execution.

The workflow package owns workflow policy, role guards, artifact persistence, and orchestrator integration. It consumes `SubagentManagerApi` and related request/result types from the public `@tsuuanmi/pi` package boundary. It does not define a second subagent contract, adapter, manager, or fallback path.

## Ownership

- `@tsuuanmi/pi-agent`: generic `Agent`, model/thinking-level types, messages, tools, and agent-loop contracts.
- `@tsuuanmi/pi`: `SubagentManager`, subagent records/requests/results, lifecycle schemas and execution, receipts, progress, yield extraction, persistence, native/tmux backends, and controls.
- `src/tool/context.ts`: workflow context with the Pi-provided `SubagentManagerApi`.
- `src/skills/*/`: workflow policy, role guards, artifact persistence, and orchestrator integration.
- `src/tool/surface.ts`: static workflow discoverability for the Pi-owned lifecycle tools.

The workflow extension does not register or reimplement the Pi lifecycle tools. Pi registers those tools through its built-in extension. Workflow-specific tools use the manager already present in their execution context.

## Model-Visible Tools

Pi registers these lifecycle tools:

| Tool | Purpose |
|------|---------|
| `subagent_spawn` | Spawn a Pi-native subagent. |
| `subagent_status` | List or inspect durable subagent records. |
| `subagent_await` | Await a live subagent or read its terminal result. |
| `subagent_steer` | Steer a live or saved subagent. |
| `subagent_pause` | Pause a running subagent at a safe boundary. |
| `subagent_resume` | Resume a persistent saved subagent context. |
| `subagent_cancel` | Cancel a live or durable subagent record. |

The workflow package registers only its workflow tools: Deep Interview, Ralplan, Team, and Ultragoal. Workflow tools that execute agents call the Pi manager in their `WorkflowContext`; they do not construct a manager.

## Guarded Workflow Execution

- Ralplan computes the legal next role/stage from its run artifacts before `ralplan_run_agent` proceeds.
- Team computes the expected worker/reviewer/prover role before execution proceeds.
- Ultragoal computes the expected goal before `ultragoal_spawn_goal_agent` proceeds.

These guards are workflow policy. Subagent lifecycle, session ownership, persistence, and cancellation remain Pi responsibilities.

## Context Boundary

```typescript
interface WorkflowContext {
  cwd: string;
  sessionManager: { getSessionId(): string };
  subagents: SubagentManagerApi;
}
```

`WorkflowContext.subagents` is the Pi-owned `SubagentManagerApi` supplied by the host. Workflow code may use it for an approved agent operation, but it must not create, discover, or replace the manager.

## Package Boundary

`@tsuuanmi/pi-workflows` depends on the public `@tsuuanmi/pi` package entry point. It must not import `#pi/*` internals. Pi does not depend on the workflows package; the package graph therefore has one direction and no cycle.
