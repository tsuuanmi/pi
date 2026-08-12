# Orchestrator vs. Workflows

`@tsuuanmi/pi-orchestrator` and `@tsuuanmi/pi-workflows` are separate layers.

## `@tsuuanmi/pi-orchestrator`

Owns reusable execution mechanisms:

- task graphs, queues, teams, routing, checkpoints, and consensus verification;
- session-aware `SubagentManager` contracts and implementation;
- subagent persistence, lifecycle tools, progress, receipts, native execution, and durable inspection;
- generic adapters over Pi's public session services and `Agent` runtime.

Orchestrator depends on public `@tsuuanmi/pi` session APIs plus `@tsuuanmi/pi-agent`. It must not import Pi private aliases or workflow policy.

## `@tsuuanmi/pi-workflows`

Owns product policy and user-facing procedures:

- Deep Interview;
- Ralplan;
- Team;
- Ultragoal;
- workflow state, approvals, role ordering, artifacts, command dispatch, and hooks;
- composition of the orchestrator subagent runtime into the bundled Pi extension.

Workflows consume public Pi and orchestrator APIs. They must not define a second subagent manager, task scheduler, checkpoint format, or orchestration primitive.

## `@tsuuanmi/pi`

Pi remains the core application/session host:

- `AgentSession`, `SessionManager`, auth, settings, model registry, resources, tools, modes, CLI, and TUI integration;
- generic `AgentSessionServices` exposed through `ExtensionContext.sessionServices`;
- generic Pi/tmux host utilities.

Pi does not depend on orchestrator or workflows and has no subagent-specific manager, worker dispatch, tools, storage, or exports.

## Dependency direction

```text
workflows -> orchestrator -> pi -> agent -> ai
          -> pi -> tui
```

Each arrow means "depends on." Workflows also depend directly on the lower-level packages whose public types they use.

## Rule of thumb

- If code defines reusable execution mechanics, it belongs in orchestrator.
- If code defines a named workflow's policy or procedure, it belongs in workflows.
- If code hosts the main application session or generic extension boundary, it belongs in Pi.
