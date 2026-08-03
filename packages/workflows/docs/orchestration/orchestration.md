# Workflow Policy

Cross-workflow prompts, handoffs, gates, and expected-next guards. Generic multi-agent execution belongs to `@tsuuanmi/pi-orchestrator`; subagent lifecycle guards live under `src/subagents/`.

**Source:** `src/policy/`, `src/handoff/`

## Module Structure

| Module | Description |
|--------|-------------|
| `context-templates.ts` | Cross-workflow context prompt templates. |
| `expected-next-role.ts` | Expected-next role guards used by guarded spawn paths. |
| `gate-verdicts.ts` | Gate verdict types shared across skills. |
| `handoff.ts` | Handoff types for workflow transitions and spec handoff. |
| `vagueness-gate.ts` | Vagueness gating helpers. |
| `deep-interview/guards.ts` | Deep Interview handoff validation. |
| `ralplan/guards.ts` | Ralplan role and approval-target validation. |
| `subagents/manager.ts` | Required injected `SubagentManager` access. |
| `subagents/thinking-level.ts` | Agent thinking-level validation. |

## Important Contracts

- Guarded spawn paths use expected-next helpers so role/task/goal execution cannot skip ahead.
- Handoff helpers assert the target skill is a legal next workflow.

## See Also

- [Workflow control plane](../workflow.md)
- [Runtime](../runtime/runtime.md)
- [Subagents](../subagents/subagents.md)
