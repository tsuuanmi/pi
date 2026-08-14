# Canonical `.pi` Session Layout

**Status:** Implemented canonical layout. This document is the single source of truth for the session layout that `@tsuuanmi/pi` owns and that `@tsuuanmi/pi-orchestrator` and `@tsuuanmi/pi-workflows` consume.

**Owner:** `@tsuuanmi/pi` owns the session layout contract. Orchestrator and workflows must not define their own session-root paths; they call pi's `session/layout` builders.

## Design principles

1. **One owner of the layout.** `@tsuuanmi/pi` exposes a `session/layout` module that is the only place session-root paths are defined. Orchestrator and workflows import from it and never hard-code `.pi/<session-id>/...` segments.
2. **One root per concept.** A skill is one `skills/<skill>/` subtree. Its artifacts and state never split across roots.
3. **One home per record kind.** Every record type (subagent, workflow execution, audit, transaction, artifact, state) has exactly one canonical location.
4. **Root has only well-named buckets.** No loose files at the session root.
5. **Shared vs. skill-owned is explicit.** Runtime-owned shared records (audit, transactions, generic subagents) live under `state/`; workflow-owned content lives under `artifacts/` and `skills/`.
6. **One-time migration, no version marker.** Existing sessions are relocated to the new layout by a single tool-driven migration; unmigrated sessions are treated as stale.

## Ownership model

| Layer | Owns | Consumes |
|-------|------|----------|
| `@tsuuanmi/pi` | The `.pi/` root, `.pi/<session-id>/` root, `.pi/<session-id>/state/` container, and the canonical bucket taxonomy + path builders (`session/layout`). | — |
| `@tsuuanmi/pi-orchestrator` | Content under `state/subagent/` (generic subagent lifecycle records). | pi `session/layout` for the `state/subagent` path. |
| `@tsuuanmi/pi-workflows` | Content under `artifacts/` and `skills/` (workflow artifacts, per-skill state, workflow execution records). | pi `session/layout` for all session-root paths. |

**Key rule:** orchestrator imports pi's shared builders directly. Workflows also import shared builders directly and define only skill-specific descendants in each skill's `paths.ts`.

## Canonical layout

```
.pi/<session-id>/
├── state/                          # shared session state (pi-owned container)
│   ├── audit.jsonl                 # append-only audit log
│   ├── transactions/               # mutation transaction journals
│   ├── subagent/                   # orchestrator-owned generic subagent records (canonical)
│   │   ├── index.jsonl
│   │   ├── <subagent-id>/
│   │   │   ├── record.json
│   │   │   └── artifact.json
│   │   └── sessions/<ts>_<id>.jsonl
│   └── api-usage.jsonl             # folded in from session root (was loose at root)
├── artifacts/                      # durable workflow artifacts (workflow-owned)
│   ├── plans/<skill>/<runId>/      # ralplan plan dirs (moved from plans/ralplan/)
│   │   ├── index.jsonl
│   │   ├── pending-approval.md
│   │   ├── obstacles.json
│   │   ├── checkpoints/
│   │   ├── gates/
│   │   └── stage-*.md
│   └── specs/                      # deep-interview specs (moved from specs/)
│       ├── deep-interview-index.jsonl
│       └── deep-interview-<slug>.md
└── skills/                         # one bucket per skill (workflow-owned)
    ├── active-state.json           # HUD aggregate (moved from workflows/active-state.json)
    ├── ralplan/
    │   ├── state.json
    │   └── executions/<subagent-id>.json   # workflow-owned meaning, refs subagent id
    ├── ultragoal/
    │   ├── state.json
    │   ├── brief.md
    │   ├── goals.json
    │   ├── ledger.jsonl
    │   └── checkpoints/
    ├── team/
    │   ├── state.json
    │   └── <teamId>/
    └── deep-interview/
        └── state.json
```

Global (non-session) roots are out of scope for the session layout:

- `.pi/state/harness/` — the control-plane owner root (`PI_HARNESS_STATE_ROOT`), global, not session-scoped.
- `~/.pi/agent/sessions/` — the actual conversation JSONL files, owned by pi's `SessionManager`, already separate.

## Subagent / workflow execution boundary

The subagent lifecycle record and the workflow execution meaning are separate concerns with a strict ownership boundary:

| Concern | Owner | Location | Content |
|---------|-------|----------|---------|
| Subagent lifecycle | orchestrator | `state/subagent/<id>/` | status, result, artifact, session file |
| Workflow execution meaning | workflow | `skills/<skill>/executions/<subagent-id>.json` | `subagent_id` ref + `run_id`, `stage`, `stage_n`, `role`, validation |
| Workflow state | workflow | `skills/<skill>/state.json` | phase, goals, counts, active-state |

- **Subagent owns subagent things.** The orchestrator is the sole owner of the subagent lifecycle record. The workflow never writes to `state/subagent/`.
- **Workflow owns state and workflow meaning.** The workflow owns everything under `skills/<skill>/`, including its per-execution meaning.
- **Read via the public API, write only workflow fields.** The workflow reads subagent records through the orchestrator's public `SubagentStore.read/list` API and writes an execution record storing only workflow-owned fields plus a `subagent_id` reference. It does not copy status, result text, artifact, or any other subagent field.

## Path contract — `session/layout`

`@tsuuanmi/pi` exposes a `session/layout` module (extending the existing `session/root`). It is the single source of truth for every session-root path:

```ts
// @tsuuanmi/pi/session/layout
piGlobalRoot(cwd)                       // .pi/
piSessionRoot(cwd, sessionId)           // .pi/<id>/
sessionStateDir(cwd, sessionId)         // .pi/<id>/state/
sessionAuditPath(cwd, sessionId)        // .pi/<id>/state/audit.jsonl
sessionTransactionsDir(cwd, sessionId) // .pi/<id>/state/transactions/
sessionSubagentDir(cwd, sessionId)     // .pi/<id>/state/subagent/
sessionApiUsagePath(cwd, sessionId)    // .pi/<id>/state/api-usage.jsonl
sessionArtifactsDir(cwd, sessionId)    // .pi/<id>/artifacts/
sessionSkillsDir(cwd, sessionId)       // .pi/<id>/skills/
sessionActiveStatePath(cwd, sessionId) // .pi/<id>/skills/active-state.json
skillStatePath(cwd, skill, sessionId)  // .pi/<id>/skills/<skill>/state.json
skillExecutionsDir(cwd, skill, sessionId) // .pi/<id>/skills/<skill>/executions/
```

The existing `session/root` primitives (`piGlobalRoot`, `piSessionRoot`, `sessionStateDir`) remain; `session/layout` adds the canonical bucket builders on top.

## Migration

Because `.pi` is runtime-owned, migration is driven through the sanctioned `pi` tooling, not hand edits. Run `pi workflow migrate --input '{"sessionId":"..."}'`; add `--dry-run` to preview it. The command preflights all conflicts, relocates legacy roots with rollback-safe moves, rewrites legacy ralplan agent files as workflow execution records, and emits an audit receipt. Re-running after success is a no-op. There is no layout-version marker, dual reader, compatibility path, or auto-relocation.

## See Also

- [Session Storage](sessions.md) — session behavior and conversation files.
- [Session Format](session-format.md) — the JSONL conversation format.
- [Workflow control plane](../../../workflows/docs/workflow.md) — workflow runtime artifacts under the session root.
