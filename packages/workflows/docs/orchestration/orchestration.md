# Orchestration

Cross-workflow prompts, handoffs, gates, expected-next guards, and command/tool helpers.

**Source:** `src/orchestration/`

## Module Structure

| Module | Description |
|--------|-------------|
| `context-templates.ts` | Cross-workflow context prompt templates. |
| `expected-next-role.ts` | Expected-next role guards used by guarded spawn paths. |
| `gate-verdicts.ts` | Gate verdict types shared across skills. |
| `handoff.ts` | Handoff types for workflow transitions and spec handoff. |
| `vagueness-gate.ts` | Vagueness gating helpers. |
| `workflow-tool-utils.ts` | Command and tool helpers shared by skill tool registrations. |

## Important Contracts

- Guarded spawn paths use expected-next helpers so role/task/goal execution cannot skip ahead.
- Handoff helpers assert the target skill is a legal next workflow.

## See Also

- [Workflow control plane](../workflow.md)
- [Runtime](../runtime/runtime.md)
- [Subagents](../subagents/subagents.md)
