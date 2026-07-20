# Session

Session-scoped path builders and session id resolution.

**Source:** `src/session/`

## Module Structure

| Module | Description |
|--------|-------------|
| `paths.ts` | Session-scoped path builders for state, artifacts, specs, plans, and ledgers. |
| `session-layout.ts` | Layout helpers for `.pi/<session-id>/` workflow, specs, plans, and audit paths. |
| `session-resolution.ts` | Session id resolution from command input and context. |

## Important Contracts

- Session-scoped helpers require an explicit `sessionId`; workflow state must not fall back to a global bucket.
- One logical workflow (one interview, one plan, one team run, one goal run) must keep all state, specs, plans, and handoff artifacts under one session id.

## See Also

- [Workflow control plane](../workflow.md)
- [Runtime](../runtime/runtime.md)
