# Audit

Append-only audit records, decision ledgers, tamper evidence, and mutation journals.

**Source:** `src/audit/`

## Module Structure

| Module | Description |
|--------|-------------|
| `audit-log.ts` | Append-only audit log records. |
| `decision-ledger.ts` | Decision ledger entries. |
| `tamper-detection.ts` | Tamper evidence checks. |
| `transaction-journal.ts` | Mutation transaction journals used by journaled writes (e.g. ralplan completion transactions). |

## See Also

- [Workflow control plane](../workflow.md)
- [Artifacts](../artifacts/artifacts.md)
