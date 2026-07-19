# Shared Workflow Utilities

Cross-skill utilities used by Deep Interview, Ralplan, Team, Ultragoal, the workflow command layer, and the workflow extension.

**Source:** `src/harness/shared/`

## Module Structure

| Directory | Modules | Description |
|-----------|---------|-------------|
| `artifacts/` | `artifacts.ts` | Durable artifact writing and receipt helpers. |
| `audit/` | `audit-log.ts`, `decision-ledger.ts`, `tamper-detection.ts`, `transaction-journal.ts` | Append-only audit records, decision ledgers, tamper evidence, and mutation journals. |
| `compaction/` | `compaction.ts` | Prompt-budgeted compact state projections. |
| `hud/` | `hud.ts` | HUD chip formatting, workflow HUD lifecycle hook, and MCP HUD mirroring. |
| `orchestration/` | `context-templates.ts`, `expected-next-role.ts`, `gate-verdicts.ts`, `handoff.ts`, `vagueness-gate.ts`, `workflow-tool-utils.ts` | Cross-workflow prompts, expected-next guards, gate verdicts, handoff types, vagueness gating, and command/tool helpers. |
| `registry/` | `skill-registry.ts`, `workflow-manifest.ts` | Built-in skill registry and workflow manifest metadata. |
| `session/` | `paths.ts`, `session-layout.ts`, `session-resolution.ts` | Session-scoped path builders and session id resolution. |
| `state/` | `active-state.ts`, `state-schema.ts`, `state-writer.ts`, `workflow-state.ts` | Active workflow state, state validation/writes, workflow ids, and base state models. |

## Important Contracts

- Session-scoped helpers require an explicit `sessionId`; workflow state must not fall back to a global bucket.
- Workflow writes use atomic state/artifact helpers and append receipts or audit entries where applicable.
- Guarded spawn paths use expected-next helpers so role/task/goal execution cannot skip ahead.
- `syncWorkflowHudUi` intentionally does not mirror workflow state into extension status slots; the interactive status line reads `.pi/<session-id>/workflows/active-state.json` directly.

## See Also

- [Workflow control plane](../../workflow.md)
- [Harness runtime](../runtime/harness-runtime.md)
