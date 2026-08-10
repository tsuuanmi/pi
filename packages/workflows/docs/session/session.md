# Session

Session-scoped path builders and session id resolution.

**Source:** `src/session/`

## Module Structure

| Module | Description |
|--------|-------------|
| `paths.ts` | Session-scoped path builders for state, artifacts, specs, plans, and ledgers. |
| `session-layout.ts` | Workflow-owned layout helpers for workflow, specs, plans, and audit paths. |

Shared `.pi` root and session path primitives are provided by `@tsuuanmi/pi/session/root`; this package owns only workflow-specific paths and state below those roots.

## Important Contracts

- Session-scoped helpers require an explicit `sessionId`; workflow state must not fall back to a global bucket.
- CLI state commands require `--session`; runtime action payloads require `sessionId`; tool calls use the host session context. Sources are never merged or inferred.
- Active-state entries and handoff journals must carry the same session identity as their owning path; missing or mismatched identity is invalid.
- One logical workflow (one interview, one plan, one team run, one goal run) must keep all state, specs, plans, and handoff artifacts under one session id.

## See Also

- [Workflow control plane](../workflow.md)
- [Runtime](../runtime/runtime.md)
