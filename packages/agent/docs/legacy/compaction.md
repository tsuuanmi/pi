# Compaction

Context compaction helpers are no longer implemented or exported from `packages/agent/src`.

This package still defines the compaction summary message role used by hosts:

- [`CompactionSummaryMessage`](../messages.md)
- `createCompactionSummaryMessage()`
- `COMPACTION_SUMMARY_PREFIX`
- `COMPACTION_SUMMARY_SUFFIX`
- `convertToLlm()` handling for `role: "compactionSummary"`

Compaction policy, summary generation, and persistence are higher-layer host responsibilities.
