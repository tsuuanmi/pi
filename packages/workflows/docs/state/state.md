# State

Active workflow state, state validation/writes, workflow ids, and base state models.

**Source:** `src/state/`

## Module Structure

| Module | Description |
|--------|-------------|
| `active-state.ts` | Active workflow state read by the interactive HUD. |
| `state-schema.ts` | State schema and validation. |
| `state-writer.ts` | Atomic state writes and JSON helpers. |
| `workflow-state.ts` | Workflow ids and base state models. |

## Important Contracts

- Workflow writes use atomic state/artifact helpers and append receipts or audit entries where applicable.
- The interactive status line reads session-scoped active state (`.pi/<session-id>/workflows/active-state.json`) directly on a 1s refresh.

## See Also

- [Workflow control plane](../workflow.md)
- [Artifacts](../artifacts/artifacts.md)
- [Compaction](../compaction/compaction.md)
