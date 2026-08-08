# Compaction

Prompt-budgeted compact state projections.

**Source:** `src/compaction/compaction.ts`

## Overview

The shared compaction helper registers and dispatches deterministic, prompt-efficient projections for each skill. Ralplan, Team, and Ultragoal provide dedicated `compact.ts` modules; Deep Interview provides its projection from `src/skills/deep-interview/state.ts`. The shared helper provides the common registration, dispatch, and budget plumbing.

## See Also

- [Workflow control plane](../workflow.md)
- [State](../state/state.md)
