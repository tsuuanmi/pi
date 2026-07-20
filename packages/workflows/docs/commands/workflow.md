# Workflow Commands

Command entry points live under `src/commands/`.

## Modules

| Module | Description |
|--------|-------------|
| `workflow.ts` | Public compatibility wrapper for the workflow command exports. |
| `workflow/args.ts` | Shared parsing for `pi workflow ...` command arguments and structured input. |
| `workflow/index.ts` | Public command dispatcher and package-command contract entry point. |
| `workflow/runtime.ts` | Lifecycle, owner, primitive runtime, GC, event, and retire verb handlers. |
| `workflow/skill-verbs.ts` | Deep Interview, ralplan, team, and ultragoal skill verb handlers. |
| `workflow/state.ts` | `pi workflow state <skill> <read|write|clear|handoff|active|doctor>` implementation. |
| `workflow/types.ts` | Shared workflow command result type. |
| `workflow/utils.ts` | Shared command input, output, validation, and manifest helpers. |

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

Every verb accepts `--json` where meaningful and `--input '<JSON object>'` for structured arguments. Session-scoped verbs require `sessionId` in the input or an explicit session source as documented in [workflow.md](../workflow.md#current-session-command-propagation).

## Skill Actions

| Skill | Actions |
|-------|---------|
| `deep-interview` | `plan-question`, `record-answer`, `record-scoring`, `read-compact`, `closure-check`, `restate-goal`, `write-spec` |
| `ralplan` | `record-explorer-gate`, `write-artifact`, `status`, `read-compact`, `doctor`, `approve-plan` |
| `team` | `start`, `snapshot`, `read-compact`, `create-task`, `transition-task`, `send-message`, `record-review-gate`, `record-completion-gate`, `complete` |
| `ultragoal` | `create-plan`, `status`, `read-compact`, `start-next`, `checkpoint`, `record-review-blockers`, `classify-blocker`, `guard` |

Removed compatibility verbs (`ralplan run-agent`, `team spawn-task-agent`, `ultragoal spawn-goal-agent`) fail closed with guidance to use the model-visible tools. Generic `pi workflow subagent` / `subagents` command shims are removed; use the `subagent_*` model-visible tools.

## See Also

- [Workflow control plane](../workflow.md)
- [Runtime](../runtime/runtime.md)
- [State](../state/state.md)
- [Orchestration](../orchestration/orchestration.md)
