# Canonical `.pi` Session Layout — Design

**Date:** 2026-08-13

**Status:** Implemented

**Owners:** `@tsuuanmi/pi` (core session layout contract), `@tsuuanmi/pi-orchestrator` (generic subagent records), `@tsuuanmi/pi-workflows` (workflow artifacts + state)

**Goal:** A single, canonical, production-ready `.pi/<session-id>/` layout where `@tsuuanmi/pi` owns the core "session features" (the layout contract) and every other package consumes it — never redefining session-root paths ad hoc.

---

## 1. Design goal and principles

The current `.pi/<session-id>/` tree is the union of five independent path builders across three packages. The result is inconsistent (skills split across roots, duplicate folder names, subagent/agent records in two places). The fix is to make `@tsuuanmi/pi` the **single owner of the session layout contract**, and have orchestrator and workflows build on it.

Design principles:

1. **One owner of the layout.** `@tsuuanmi/pi` exposes a `session/layout` module that is the *only* place session-root paths are defined. Orchestrator and workflows import from it and never hard-code `.pi/<session-id>/...` segments.
2. **One root per concept.** A skill is one `skills/<skill>/` subtree. Its artifacts and state never split across roots.
3. **One home per record kind.** Every record type (subagent, agent execution, audit, transaction, artifact, state) has exactly one canonical location.
4. **Root has only well-named buckets.** No loose files at the session root.
5. **Shared vs. skill-owned is explicit.** Runtime-owned shared records (audit, transactions, generic subagents) live under `state/`; workflow-owned content lives under `artifacts/` and `skills/`.
6. **One-time migration, no version marker.** Existing sessions are relocated to the new layout by a single tool-driven migration; unmigrated sessions are treated as stale. No `layoutVersion` dual-reader is introduced.

---

## 2. Ownership model

The layering is the standard "core owns the contract, consumers own the content" pattern.

| Layer | Owns | Consumes |
|-------|------|----------|
| `@tsuuanmi/pi` | The `.pi/` root, `.pi/<session-id>/` root, `.pi/<session-id>/state/` container, and the canonical bucket taxonomy + path builders (`session/layout`). | — |
| `@tsuuanmi/pi-orchestrator` | Content under `state/subagent/` (generic subagent lifecycle records). | pi `session/layout` for the `state/subagent` path. |
| `@tsuuanmi/pi-workflows` | Content under `artifacts/` and `skills/` (workflow artifacts, per-skill state, workflow execution records). | pi `session/layout` for all session-root paths. |

**Key rule:** orchestrator and workflows must not define their own `join(piSessionRoot(...), "…")` paths. They call pi's `session/layout` builders. This is the change that makes the layout canonical.

---

## 3. Canonical layout

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
    │   └── executions/<subagent-id>.json   # workflow-owned meaning, refs subagent id (see §4)
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

Global (non-session) roots stay as-is and are out of scope for the session layout:
- `.pi/state/harness/` — the control-plane owner root (`PI_HARNESS_STATE_ROOT`), global, not session-scoped.
- `~/.pi/agent/sessions/` — the actual conversation JSONL files, owned by pi's `SessionManager`, already separate.

---

## 4. Resolving the subagent / agent-record duplication — clear boundary

Today the same underlying `SubagentRecord` is written twice: orchestrator writes the generic record to `state/subagent/<id>/record.json`, and ralplan re-serializes a workflow-shaped copy to `workflows/ralplan/agents/<id>.json`. This is the "workflow also uses the subagent folder" problem.

**Design decision — strict ownership boundary, no duplication:**

- **Subagent owns subagent things.** The orchestrator is the sole owner of the subagent lifecycle record: `state/subagent/<id>/record.json` + `artifact.json` (status, result, artifact, session file). The workflow **never writes** to `state/subagent/`.
- **Workflow owns state and workflow meaning.** The workflow owns everything under `skills/<skill>/`. Its per-execution meaning (which subagent ran which stage, the workflow validation result) is workflow state, stored as a workflow-owned execution record at `skills/<skill>/executions/<subagent-id>.json`.
- **Read via the public API, write only workflow fields.** The workflow's post-result hook reads the subagent record through the orchestrator's public `SubagentStore.read/list` API (never by re-serializing it) and writes an execution record that stores **only** workflow-owned fields (`run_id`, `stage`, `stage_n`, `role`, workflow validation result) plus a `subagent_id` reference. It does **not** copy status, result text, artifact, or any other subagent field.

Resulting boundary:

| Concern | Owner | Location | Content |
|---------|-------|----------|---------|
| Subagent lifecycle | orchestrator | `state/subagent/<id>/` | status, result, artifact, session file |
| Workflow execution meaning | workflow | `skills/<skill>/executions/<subagent-id>.json` | `subagent_id` ref + `run_id`, `stage`, `stage_n`, `role`, validation |
| Workflow state | workflow | `skills/<skill>/state.json` | phase, goals, counts, active-state |

This removes the duplicate record entirely: the subagent record is written once by the orchestrator, and the workflow writes only its own meaning, referencing the subagent id.

---

## 5. Path contract — pi-owned `session/layout`

`@tsuuanmi/pi` exposes a `session/layout` module (extending the existing `session/root`). It is the single source of truth for every session-root path. Proposed API:

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

Orchestrator and workflows import these builders and stop defining their own session-root joins. The existing `session/root` primitives (`piGlobalRoot`, `piSessionRoot`, `sessionStateDir`) remain; `session/layout` adds the canonical bucket builders on top.

---

## 6. Migration plan

Because `.pi` is runtime-owned, migration is driven through the sanctioned `pi` tooling, not hand edits.

| # | Step | Priority | Risk |
|---|------|----------|------|
| 1 | Add `session/layout` to `@tsuuanmi/pi`; keep existing `session/root` primitives and import canonical builders directly. | High | Low |
| 2 | Point orchestrator `SubagentStore` at `sessionSubagentDir` (path only; content unchanged). | High | Low |
| 3 | Point workflows at `sessionArtifactsDir` / `sessionSkillsDir`; move `plans/`, `specs/`, `ultragoal/`, `team/`, `workflows/` content into the new buckets. | High | High |
| 4 | Fold `api-usage.jsonl` under `state/`. | Low | Low |
| 5 | Move ralplan agent records to `skills/ralplan/executions/` as workflow-owned records referencing `state/subagent/<id>` (no subagent field duplication). | High | Medium |
| 6 | **One-time migration** (no version marker): `pi workflow migrate` moves existing sessions to the new layout. Unmigrated sessions are treated as stale. | High | Medium |
| 7 | Update docs (`docs/session/session.md`, `docs/state/state.md`, `docs/subagent/subagent.md`, `docs/source-tree.md`, `docs/workflow.md`, pi `docs/session/*`) and changelogs. | Medium | Low |
| 8 | Update path-resolution tests; rebuild each package `dist/` before `vitest`/`tsgo`. | Medium | Low |

**No version marker.** The `layoutVersion` marker is dropped. Rationale: `.pi` is runtime-owned and regenerable, and this is a pre-1.0 internal layout, so a versioned dual-reader adds complexity for little value. Instead, a single one-time migration relocates existing sessions (including `20260812-035656`) to the new layout; any session not migrated is treated as stale and recoverable from workflow state. The migration must preflight every conflict, use rollback-safe moves, and be tested against a session copy.

---

## 7. Verification

For the eventual implementation (not run here — review-only):

- `tsgo --noEmit` (root) after each package change.
- `biome check --write --error-on-warnings .` (root).
- Rebuild `dist/` for `pi`, `orchestrator`, and `workflows` before running tests (workspace tests import from `dist/`).
- Targeted `vitest` on `test/session/`, `test/state/`, `test/subagent/`, and the ralplan/ultragoal agent-execution tests.
- A migration dry-run against a copy of session `20260812-035656` to confirm no data loss and that the HUD still reads `active-state.json`.

---

## 8. Risks and open questions

- **Breaking change across three packages.** The path contract moves into pi; all consumers must update in lockstep. Mitigated by keeping `session/root` exports and adding `session/layout` alongside.
- **In-flight sessions.** A session mid-workflow must not be corrupted by a layout change. Migration uses strict conflict preflight and rollback-safe moves; unmigrated sessions are stale and recoverable.
- **HUD contract.** `active-state.json` moves from `workflows/` to `skills/`. The workflow HUD reader uses pi's canonical builder; there is no compatibility read.
- **Resolved:** generic subagent records remain under `state/subagent/`; workflow execution records live under `skills/<skill>/executions/`.
- **Resolved:** durable human-readable plans live under `artifacts/plans/<skill>/<runId>/`; machine state and execution metadata live under `skills/`.

---

## 9. Summary

The implemented design makes `@tsuuanmi/pi` the single owner of the session layout contract via `session/layout`. Orchestrator imports the shared subagent builder directly; workflows import shared builders directly and define only skill-specific descendants. The resulting tree has one root per skill (`skills/<skill>/`), one home per record kind (generic subagents in `state/subagent/`, workflow execution metadata in `skills/<skill>/executions/`, artifacts in `artifacts/`, shared state in `state/`), and no loose session-root files. Migration is one-time, marker-free, conflict-preflighted, and rollback-safe.

No source code was changed by this design.
