# Ultragoal Quality Gate

Completion checkpoints validate typed evidence before mutating the goal plan.

**Source:** `src/skills/ultragoal/quality-gate/`

## Module Structure

| Module | Responsibility |
|--------|----------------|
| `types.ts` | Public quality-gate evidence types. |
| `rows.ts` | Shared row shape, status, link, and outcome validators. |
| `evidence.ts` | Artifact references, CLI replay, and live-surface proof validation. |
| `surfaces.ts` | Surface, contract, adversarial, and mandatory computer-case validation. |
| `validation.ts` | Architect, executor, iteration, and top-level completion validation. |

`validation.ts` is the only completion-gate entry point. Lower-level modules contain reusable validators and do not mutate workflow state.

## Test

`test/ultragoal/quality-gate/validation.test.ts`

## See Also

- [Ultragoal skill](../)
