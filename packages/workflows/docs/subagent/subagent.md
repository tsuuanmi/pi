# Workflow and Subagent Integration

`@tsuuanmi/pi-orchestrator` owns the complete session-aware subagent boundary. A Pi-hosted subagent wraps the generic `Agent` from `@tsuuanmi/pi-agent` with an isolated `AgentSession`, persistence, resource loading, lifecycle controls, and native/tmux execution.

The workflow package owns workflow policy, role guards, artifact persistence, and runtime composition. It consumes `SubagentManagerApi` and related request/result types from `@tsuuanmi/pi-orchestrator`. It does not define a second subagent contract, manager, or fallback path.

## Ownership

- `@tsuuanmi/pi-agent`: generic `Agent`, model/thinking-level types, messages, tools, and agent-loop contracts.
- `@tsuuanmi/pi`: the main application session, session services, resource loading, settings, auth, and extension host.
- `@tsuuanmi/pi-orchestrator`: `SubagentManager`, records/requests/results, lifecycle schemas and execution, receipts, progress, yield extraction, persistence, native/tmux backends, and controls.
- `src/tool/context.ts`: workflow context with the orchestrator-provided `SubagentManagerApi`.
- `src/skills/*/`: workflow policy, role guards, artifact persistence, and orchestrator integration.
- `src/tool/surface.ts`: static workflow discoverability for orchestrator-owned lifecycle tools.

The workflow extension installs the authoritative orchestrator runtime with `registerSubagentRuntime`; it does not reimplement lifecycle tools. Workflow-specific tools receive the same manager through their `WorkflowContext`.

## Model-Visible Tools

The orchestrator runtime registers these lifecycle tools:

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

These guards are workflow policy. Subagent lifecycle, isolated session creation, persistence, and cancellation remain orchestrator responsibilities; the main application session remains Pi-owned.

## Context Boundary

```typescript
interface WorkflowContext {
  cwd: string;
  sessionManager: { getSessionId(): string };
  subagent: SubagentManagerApi;
  model?: Model;
}
```

`WorkflowContext.subagent` is the orchestrator-owned `SubagentManagerApi` resolved from Pi's generic extension session services. Workflow code may use it for an approved agent operation, but it must not create, discover, or replace the manager. Team execution also requires the host's active `model`; it fails before orchestration when no model is available.

## Package Boundary

`@tsuuanmi/pi-workflows` depends on the public Pi and orchestrator package entry points. It must not import `#pi/*` or `#orchestrator/*` internals. Pi depends on neither orchestrator nor workflows; orchestrator depends on public Pi APIs, so the graph remains acyclic.
