# Workflow Commands

Command entry points live under `src/commands/`.

## Boundary

This directory is the CLI adapter for the external `pi workflow ...` control plane. It does not register or invoke model-visible workflow tools.

The package-command entry point parses command arguments and dispatches directly to command, runtime, state, and skill handlers:

```text
pi workflow ...
  -> src/commands/workflow.ts
  -> src/commands/workflow/index.ts
  -> runtime.ts, state.ts, or skill-commands.ts
  -> workflow runtime/state/skill implementation
```

Command handlers return a `WorkflowCommandResult` with an exit status and text output. They may route lifecycle operations to a live `RuntimeOwner` through workflow RPC or use a no-owner fallback, but they never create a tool call.

Some command actions and model-visible tools use the same lower-level skill functions. That shared implementation is the boundary: commands and tools do not call each other. For the complete surface comparison, see [Command and tool boundary](../workflow.md#command-and-tool-boundary).

## Modules

| Module | Description |
|--------|-------------|
| `workflow.ts` | Public workflow command entry and dispatcher adapter. |
| `workflow/args.ts` | Shared parsing for `pi workflow ...` command arguments and structured input. |
| `workflow/index.ts` | Public command dispatcher and package-command contract entry point. |
| `workflow/runtime.ts` | Lifecycle, owner, primitive runtime, GC, event, and retire verb handlers. |
| `workflow/skill-commands.ts` | Deep Interview, ralplan, team, and ultragoal skill command handlers. |
| `workflow/state.ts` | `pi workflow state <skill> <read|write|clear|handoff|active|doctor>` implementation and state contract help. |
| `workflow/types.ts` | Shared workflow command result type. |
| `workflow/command-utils.ts` | Shared command input, output, validation, and manifest helpers. |

## Top-Level Verbs

`src/commands/workflow.ts` and its `src/commands/workflow/` implementation modules support:

```text
pi workflow state <skill> <action>
pi workflow start
pi workflow owner
pi workflow submit
pi workflow observe
pi workflow classify
pi workflow recover
pi workflow validate
pi workflow finalize
pi workflow operate
pi workflow gc [--prune] [--dry-run]
pi workflow events
pi workflow retire
pi workflow deep-interview <action>
pi workflow ralplan <action>
pi workflow team <action>
pi workflow ultragoal <action>
```

Every verb accepts `--json` where meaningful and `--input '<JSON object>'` for structured arguments. Session-scoped verbs require `sessionId` in the input or an explicit session source as documented in [workflow.md](../workflow.md#current-session-command-propagation). Active state and handoff records use that one session identity; missing or mismatched persisted identity fails closed. For state usage, see [State commands](../state/commands.md).

## Skill Actions

| Skill | Actions |
|-------|---------|
| `deep-interview` | `plan-question`, `record-answer`, `record-scoring`, `closure-check`, `restate-goal`, `write-spec` |
| `ralplan` | `record-explorer-gate`, `write-artifact`, `status`, `doctor`, `approve-plan` |
| `team` | `start`, `snapshot`, `create-task`, `transition-task`, `send-message`, `record-review-gate`, `record-completion-gate`, `complete` |
| `ultragoal` | `create-plan`, `status`, `start-next`, `checkpoint`, `record-obstacle`, `classify-blocker`, `guard` |

Removed compatibility verbs (`ralplan run-agent`, `team spawn-task-agent`, `ultragoal spawn-goal-agent`) fail closed with guidance to use the model-visible tools. Generic `pi workflow subagent` / `subagents` command shims are removed; use the `subagent_*` model-visible tools.

## See Also

- [Workflow control plane](../workflow.md)
- [Runtime](../runtime/runtime.md)
- [State](../state/state.md)
- [State commands](../state/commands.md)
- [Orchestration](../orchestration/orchestration.md)
