# Shared Workflow Utilities

Common utilities shared across all workflow implementations.

**Source:** `src/packages/workflows/runtime/shared/`

## Overview

The shared module provides common state management, session layout, file I/O, audit logging, tamper detection, and workflow tool infrastructure used by deep-interview, ralplan, team, and ultragoal workflows.

## Module Structure

| Module | Description |
|--------|-------------|
| `paths.ts` | Re-exports from `session-layout.ts` plus type aliases (`WorkflowSkill`, `RalplanStage`) |
| `session-layout.ts` | All session-scoped path builders (require a `sessionId`) |
| `session-resolution.ts` | Session ID resolution and directory naming |
| `state-schema.ts` | Type assertions and validators for workflow state |
| `state-writer.ts` | Atomic state file writes with temp-file + rename |
| `active-state.ts` | Active workflow tracking (which workflow is running in a session) |
| `audit-log.ts` | Append-only audit logging for workflow mutations |
| `receipts.ts` | Receipt tracking for mutation verification |
| `tamper-detection.ts` | Tamper detection for state files |
| `canonical-json.ts` | Deterministic JSON serialization for state hashing |
| `transaction-journal.ts` | Transaction journal for state mutations |
| `workflow-id.ts` | Workflow ID generation and parsing |
| `workflow-manifest.ts` | Workflow manifest for tracking workflow instances |
| `workflow-state.ts` | Base workflow state type |
| `workflow-state-tool.ts` | Tool for reading workflow state |
| `workflow-tool-utils.ts` | Shared utilities for workflow tools |
| `handoff.ts` | Inter-phase handoff utilities |

## Workflow Types

```typescript
type WorkflowSkill = "deep-interview" | "ralplan" | "team" | "ultragoal";
type RalplanStage = "planner" | "architect" | "critic" | "revision" | "adr" | "final";
```

## Session Layout

All session-aware path builders require a `sessionId` — there is no global fallback. This ensures workflow state is isolated per session.

### Path Conventions

| Path | Description |
|------|-------------|
| `.pi/{sessionId}/state/` | Session state directory |
| `.pi/{sessionId}/workflows/{skill}/` | Workflow-specific state |
| `.pi/{sessionId}/workflows/deep-interview/` | Deep interview state |
| `.pi/{sessionId}/workflows/ralplan/` | Ralplan state |
| `.pi/{sessionId}/workflows/ultragoal/` | Ultragoal state |
| `.pi/team/{teamId}/` | Team coordination state (not session-scoped) |
| `.pi/{sessionId}/specs/` | Generated specs |
| `.pi/{sessionId}/plans/` | Generated plans |
| `.pi/{sessionId}/activity.json` | Session activity file |

### Global Paths

| Path | Description |
|------|-------------|
| `.pi/` | Project root for Pi data |
| `.pi/audit.jsonl` | Global audit log |

## State Writer

State files are written atomically using temp-file + rename to prevent corruption:

```typescript
interface StateWriter {
  write(path: string, data: unknown): Promise<void>;
}
```

## Audit Log

The audit log is an append-only JSONL file that records all workflow mutations with timestamps, operation types, and actor information.

## Transaction Journal

The transaction journal records state mutations for recovery and rollback:

```typescript
interface TransactionEntry {
  id: string;
  timestamp: string;
  operation: string;
  before: unknown;
  after: unknown;
}
```

## Tool Groups

Workflow tools are organized into groups that can be enabled/disabled per phase:

```typescript
const WORKFLOW_TOOL_GROUPS = {
  read_only: ["read", "grep", "find", "ls"],
  read_write: ["read", "bash", "edit", "write", "grep", "find", "ls"],
  // ... phase-specific groups
};
```

## See Also

- [Deep Interview](../deep-interview/deep-interview.md) - Interview workflow
- [Ralplan](../ralplan/ralplan.md) - Planning workflow
- [Team](../team/team.md) - Team coordination workflow
- [Ultragoal](../ultragoal/ultragoal.md) - Goal-tracking workflow
- [Subagents](../subagents/subagents.md) - Subagent spawning utilities