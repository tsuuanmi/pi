# Workflow Policy

Cross-workflow prompts, handoffs, gates, and expected-next guards. Generic multi-agent and session-aware subagent execution belong to `@tsuuanmi/pi-orchestrator`.

**Source:** `src/policy/`, `src/handoff/`, and skill guard modules under `src/skills/*/guards.ts`.

## Module Structure

| Module | Description |
|--------|-------------|
| `policy/expected-next-role.ts` | Expected-next role guards used by guarded spawn paths. |
| `policy/gate-verdicts.ts` | Gate verdict types shared across skills. |
| `policy/vagueness-gate.ts` | Vagueness gating helpers. |
| `handoff/handoff.ts` | Handoff types for workflow transitions and spec handoff. |
| `@tsuuanmi/pi-orchestrator` | Session-aware subagent manager, lifecycle, and Agent stream adapter. |
| `skills/deep-interview/guards.ts` | Deep Interview handoff validation. |
| `skills/ralplan/guards.ts` | Ralplan role and approval-target validation. |

## Important Contracts

- Guarded spawn paths use expected-next helpers so role/task/goal execution cannot skip ahead.
- Handoff helpers assert the target skill is a legal next workflow.

## See Also

- [Workflow control plane](../workflow.md)
- [Runtime](../runtime/runtime.md)
- [Subagent](../subagent/subagent.md)
