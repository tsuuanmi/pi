# Orchestrator and Workflows

`@tsuuanmi/pi-orchestrator` and `@tsuuanmi/pi-workflows` are adjacent layers, not interchangeable packages.

## At a glance

| Package | Owns | Typical use |
| --- | --- | --- |
| `@tsuuanmi/pi-orchestrator` | Generic task DAG execution, dependency scheduling, agent routing, retries, checkpoints, task receipts, and runtime team messaging | Run a set of `Agent`s against a dependency-aware task graph |
| `@tsuuanmi/pi-workflows` | Named Pi skills, workflow commands and tools, session state, role policy, approval gates, handoffs, artifacts, and workflow receipts | Run `deep-interview`, `ralplan`, `team`, or `ultragoal` with Pi-specific rules |

The dependency direction is one-way:

```text
@tsuuanmi/pi-workflows
        -> workflow adapter
@tsuuanmi/pi-orchestrator
        ->
@tsuuanmi/pi-agent
        ->
@tsuuanmi/pi-ai
```

The orchestrator must not import workflows. Workflows may use the orchestrator when a workflow needs generic multi-agent task execution.

## How the team workflow uses the orchestrator

The `team` skill keeps its workflow state and policy in `@tsuuanmi/pi-workflows`, then maps admitted role tasks into the generic engine:

```text
workflow TeamTask[]
  -> TaskInput[] and runtime Team
  -> Orchestrator.run()
  -> task results, queue events, and task receipt references
  -> workflow state, gates, HUD, and artifacts
```

The workflow decides which role may run, validates workflow gates, owns persistence paths, and maps results back to workflow state. The orchestrator handles task dependencies, routing, retries, execution, and generic run checkpoints. A workflow-owned checkpoint store may persist an orchestrator checkpoint, but the checkpoint schema remains owned by the orchestrator.

`ralplan` and `deep-interview` remain workflow-specific processes. `ultragoal` should use the orchestrator only if it acquires a genuine generic task DAG; its goals and quality gates are otherwise workflow concepts.

## Choosing the package

Use `@tsuuanmi/pi-orchestrator` when the problem is about:

- scheduling or routing multiple agents;
- task dependencies and DAG validation;
- retries, aborts, budgets, or concurrent execution;
- generic task receipts and resumable run checkpoints.

Use `@tsuuanmi/pi-workflows` when the problem is about:

- a named Pi skill or workflow command/tool;
- expected role order, approval, review, or completion gates;
- workflow/session state, leases, handoffs, or artifacts;
- user-facing workflow receipts and recovery behavior.

For a single agent run or one subagent's lifecycle, use the `@tsuuanmi/pi-agent` and `SubagentManager` contracts instead of adding that behavior to the orchestrator.

For the complete package ownership rules, see [`package-boundaries.md`](./package-boundaries.md). For the team adapter contract, see [`team-workflow-orchestrator-adapter.md`](./team-workflow-orchestrator-adapter.md).
