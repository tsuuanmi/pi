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
| `assets/schema.json` | Agent-facing JSON Schema/contract for `pi workflow state <skill> <action>` CLI arguments and payloads. |

## Important Contracts

- Workflow writes use atomic state/artifact helpers and append receipts or audit entries where applicable.
- The interactive status line reads active-state schema version 2 from the session-owned path (`.pi/<session-id>/workflows/active-state.json`) directly on a 1s refresh.
- Every active-state entry requires a `session_id` that exactly matches the owning session. Missing, foreign, malformed, and unsupported-version active-state files fail closed; they are not migrated or merged as global state.
- State command contract metadata ships as `src/state/assets/schema.json` and is copied to `dist/state/assets/schema.json` during package builds, matching the skill-local JSON schema assets. The schema documents that state commands require `--session <id>` and that `handoff` uses `--to <skill>` rather than JSON input.

## See Also

- [State commands](commands.md)
- [Workflow control plane](../workflow.md)
- [Artifacts](../artifacts/artifacts.md)
