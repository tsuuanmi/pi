# Ralplan Orchestrator Contract

Ralplan uses `@tsuuanmi/pi-orchestrator` as an execution engine through a workflow-owned adapter. The packages have separate responsibilities.

## Boundary

| Concern | Owner |
| --- | --- |
| Expected role and stage | `pi-workflows` |
| Explorer gate and prerequisite artifacts | `pi-workflows` |
| Role prompts and agent profiles | `pi-workflows` |
| Critic verdicts and revision branches | `pi-workflows` |
| Artifact transactions and provenance | `pi-workflows` |
| Approval and handoff | `pi-workflows` |
| Task execution and runtime agent invocation | `pi-orchestrator` |
| Task checkpoint and task receipt | `pi-orchestrator` |
| Checkpoint storage and workflow receipt mapping | `pi-workflows` adapter |

The orchestrator never imports Ralplan code or interprets Ralplan roles, verdicts, artifacts, or approval state.

## Execution flow

```text
ralplan_run_agent
  -> validate expected role and stage
  -> validate prerequisite workflow artifacts
  -> construct Ralplan Agent and TaskInput
  -> Orchestrator.run(one task)
  -> verify the current stage artifact and provenance
  -> return workflow receipt referencing the task receipt
```

The initial integration runs one admitted stage per orchestrator run. This keeps conditional revision and Expert escalation in the workflow coordinator instead of encoding them as a static graph.

## Contract rules

1. `ralplan_run_agent` is the workflow entry point for Explorer, Planner, Architect, Critic, Revision, and Expert stages.
2. The workflow creates the role-specific runtime `Agent`; the orchestrator only executes it.
3. A task is not successful until the expected Ralplan artifact is committed and verified.
4. Artifact writing remains the responsibility of `ralplan_write_artifact` or the Explorer gate command.
5. `APPROVE`, `ITERATE`, and `REJECT` remain workflow decisions.
6. Planner subagent resume is distinct from orchestrator checkpoint resume.
7. Automatic retries are disabled for side-effecting Ralplan tasks.
8. A failed or unverified task cannot advance the expected-next role.
9. Workflow receipts reference orchestrator task and receipt IDs without copying their schemas.
10. Missing subagent managers, invalid stages, invalid roles, and invalid checkpoints fail explicitly; no direct-manager or in-process fallback exists.

## Identity

Every stage execution is identified by:

- workflow session ID;
- Ralplan run ID;
- stage and stage number;
- orchestrator task ID;
- Ralplan agent-run ID;
- orchestrator receipt ID.

Checkpoints are stored under the session-scoped Ralplan run directory. A completed checkpoint cannot be reused for another stage execution.

## Approved output

After explicit approval, `approved-output.ts` maps the pending plan artifact, source run, and carried obstacles into one downstream workflow input for Team or Ultragoal. Approval owns the decision and handoff transaction; the adapter only translates the approved output. It does not parse planning prose into an inferred task graph, schedule tasks, or move Ralplan policy into Orchestrator.

## Future batching

A deterministic segment such as `Planner -> Architect -> Critic` may later be submitted as one task graph. That optimization must preserve workflow artifact verification after every task. Revision and Expert branches must remain workflow-created tasks; no unbounded loop belongs in the generic engine.
