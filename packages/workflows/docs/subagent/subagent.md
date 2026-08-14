# Workflow and Agent Execution Integration

`@tsuuanmi/pi-orchestrator` owns the general session-aware agent execution core. It creates isolated `AgentSession` instances, persists generic lifecycle records, captures output, implements await/steer/pause/resume/cancel, and exposes durable inspection.

`@tsuuanmi/pi-workflows` owns workflow meaning: legal role/goal selection, bundled profile choice, model/tool policy, system prompts, detailed tasks, semantic artifacts, completion validation, and workflow state transitions. It consumes the public orchestrator API and does not define a second manager or execution backend.

## Model-visible execution tools

| Tool | Purpose |
|------|---------|
| `subagent_spawn` | Execute a fully configured agent request. The task may be inline or loaded from a workspace file; captured assistant output may be written atomically to a caller-selected workspace path. |
| `subagent_status` | List or inspect generic durable execution records. |
| `subagent_await` | Await a live run or read its terminal result. |
| `subagent_steer` | Steer a live or saved run. |
| `subagent_pause` | Pause a running agent at a safe boundary. |
| `subagent_resume` | Resume a persistent saved context. |
| `subagent_cancel` | Cancel a live or durable record. |
| `subagent_inspect` | Inspect generic durable execution state. |

`subagent_spawn` accepts the already-resolved profile, role, model/thinking overrides, system prompt, tool policy, task, persistence, opaque metadata, and optional output-artifact contract. Orchestrator persists metadata but never interprets workflow names, stages, goals, or artifact formats.

`outputArtifact` is separate from the orchestrator-owned runtime `artifact.json`. The runtime artifact always remains under `.pi/<session-id>/state/subagent/<id>/artifact.json`; caller-selected output is an additional text artifact whose path and SHA-256 digest are recorded in `SubagentRecord.output_artifact`. Create mode refuses existing paths. Replace mode requires the current SHA-256 digest. Paths must remain inside the workspace and may not traverse symbolic links.

## Guarded workflow execution

- Ralplan computes the legal next role and stage, selects the matching bundled profile, supplies Ralplan prompts/task metadata, and validates the terminal workflow artifact. Role agents persist canonical artifacts through `pi workflow ralplan record-explorer-gate` or `write-artifact`.
- Ultragoal computes the legal active goal, selects the `worker` profile, supplies the goal prompt and metadata, and retains checkpoint state as its authority.
- Team keeps `team_execute` and `team_resume` because they are multi-task orchestrator operations, not single-agent spawn aliases.
- Deep Interview uses generic `subagent_spawn` for read-only research and lateral personas.

The workflow extension installs the authoritative orchestrator runtime and registers pre/post execution hooks. Pre-spawn hooks validate guarded Ralplan/Ultragoal metadata and reject runtime profile overrides. Post-result hooks persist workflow-owned execution records and fail closed when a completed Ralplan run did not produce a valid workflow artifact.

## Package boundary

```typescript
interface WorkflowContext {
  cwd: string;
  sessionManager: { getSessionId(): string };
  subagent: SubagentManagerApi;
  model?: Model;
}
```

Workflows depend only on public Pi and orchestrator package exports. They do not import orchestrator internals, create managers, or duplicate generic lifecycle state. Orchestrator does not import workflow policy, profiles, or artifact schemas.

## Subagent / workflow execution boundary

The subagent lifecycle record and the workflow execution meaning are separate concerns with a strict ownership boundary (see [Canonical `.pi` Session Layout](../../../pi/docs/session/layout.md)):

- **Subagent owns subagent things.** The orchestrator is the sole owner of the subagent lifecycle record under `state/subagent/<id>/`. The workflow never writes to `state/subagent/`.
- **Workflow owns state and workflow meaning.** The workflow owns everything under `skills/<skill>/`, including its per-execution meaning at `skills/<skill>/executions/<subagent-id>.json`.
- **Read via the public API, write only workflow fields.** The workflow reads subagent records through the orchestrator's public `SubagentStore.read/list` API and writes an execution record storing only workflow-owned fields (`run_id`, `stage`, `stage_n`, `role`, validation) plus a `subagent_id` reference. It does not copy status, result text, artifact, or any other subagent field.
