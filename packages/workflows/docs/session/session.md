# Session

Session-scoped path builders and session id resolution.

**Source:** `src/session/`

## Module Structure

| Module | Description |
|--------|-------------|
| `paths.ts` | Session-scoped path builders for state, artifacts, specs, plans, and ledgers. |
| `root.ts` | Canonical `.pi/` root, path-segment encoding, and shared session-state primitives used by Pi and workflows. |
| `session-layout.ts` | Workflow-owned layout helpers for workflow, specs, plans, and audit paths. |
| `session-resolution.ts` | Explicit session id resolution from command input, payload, and environment. |

## Important Contracts

- Session-scoped helpers require an explicit `sessionId`; workflow state must not fall back to a global bucket.
- Session resolution accepts only flag, payload, or `PI_SESSION_ID` sources; it never scans `.pi` or selects a latest session.
- Active-state entries and handoff journals must carry the same session identity as their owning path; missing or mismatched identity is invalid.
- One logical workflow (one interview, one plan, one team run, one goal run) must keep all state, specs, plans, and handoff artifacts under one session id.

## See Also

- [Workflow control plane](../workflow.md)
- [Runtime](../runtime/runtime.md)
