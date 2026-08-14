# Canonical `.pi` Session Layout — Implementation Plan

**Date:** 2026-08-13

**Status:** Implemented

**Goal:** Land the canonical `.pi/<session-id>/` layout where `@tsuuanmi/pi` owns the session layout contract and `@tsuuanmi/pi-orchestrator` / `@tsuuanmi/pi-workflows` consume it, with a one-time migration and no version marker.

**Design reference:** [Canonical `.pi` Session Layout](../../../pi/docs/session/layout.md) and `packages/workflows/docs/reviews/2026-08-13-session-layout-canonical-design.md`.

---

## 0. Scope and safety preconditions

- **Breaking change across three packages.** All consumers must land in lockstep. Do not ship a partial layout.
- **`.pi` is runtime-owned.** Migration is driven through the sanctioned `pi` tooling, never hand-edited.
- **Precondition:** confirm no in-flight workflow session that cannot be migrated. Migration must pass strict conflict preflight and be tested against a session copy before rollout.
- **Backup:** before any migration run, snapshot the affected `.pi/<session-id>/` trees to `/tmp/agent-backups/<task-id>/` (mirroring relative paths). No `.bak` files inside the repo.

---

## 1. Phase 1 — `@tsuuanmi/pi` owns the layout contract

**Goal:** pi exposes `session/layout` as the single source of truth for session-root paths.

### 1.1 Add `packages/pi/src/session/layout.ts`

New module extending `session/root.ts`. It owns the canonical bucket builders. The existing `session/root.ts` primitives (`piGlobalRoot`, `piSessionRoot`, `sessionStateDir`) stay unchanged.

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

- `skill` is a validated union (`deep-interview | ralplan | team | ultragoal`); reuse `assertSafePathComponent` semantics (moved to pi or kept in workflows and imported).
- Keep the module pure and acyclic (no imports from orchestrator/workflows).

### 1.2 Register the export

Add to `packages/pi/package.json` `exports`:

```jsonc
"./session/layout": {
  "types": "./dist/session/layout.d.ts",
  "import": "./dist/session/layout.js"
}
```

### 1.3 Fold `api-usage.jsonl` under `state/`

In `packages/pi/src/api/api-usage-utils.ts`, change `apiUsageLogPath` to use `sessionApiUsagePath` (`.pi/<id>/state/api-usage.jsonl`) instead of `join(piSessionRoot(...), "api-usage.jsonl")`. Update `packages/pi/docs/runtime/telemetry/api-usage-logging.md` path.

**Files:** `packages/pi/src/session/layout.ts` (new), `packages/pi/package.json`, `packages/pi/src/api/api-usage-utils.ts`, `packages/pi/docs/runtime/telemetry/api-usage-logging.md`.

---

## 2. Phase 2 — orchestrator consumes pi layout

**Goal:** orchestrator stops defining its own session-root paths.

### 2.1 `subagent/store.ts`

`SubagentStore.root()` already calls `sessionStateDir(this.cwd, sessionId)` → `.pi/<id>/state/subagent/`. This is already correct and unchanged. Switch the import to the new `sessionSubagentDir` builder from `@tsuuanmi/pi/session/layout` for consistency (path is identical).

**Files:** `packages/orchestrator/src/subagent/store.ts`.

---

## 3. Phase 3 — workflows consumes pi layout

**Goal:** workflows delegates all session-root paths to pi and moves content into the canonical buckets.

### 3.1 Remove workflow-owned session layout modules

Delete `packages/workflows/src/session/session-layout.ts` and `paths.ts`. Import shared builders directly from `@tsuuanmi/pi/session/layout`; keep only skill-specific descendants in `src/skills/<skill>/paths.ts`:

| Current path | Canonical path |
|--------------|----------------|
| `.pi/<id>/workflows/<skill>/state.json` | `.pi/<id>/skills/<skill>/state.json` |
| `.pi/<id>/workflows/active-state.json` | `.pi/<id>/skills/active-state.json` |
| `.pi/<id>/plans/ralplan/<runId>/**` | `.pi/<id>/artifacts/plans/ralplan/<runId>/**` |
| `.pi/<id>/specs/**` | `.pi/<id>/artifacts/specs/**` |
| `.pi/<id>/ultragoal/**` | `.pi/<id>/skills/ultragoal/**` |
| `.pi/<id>/team/<teamId>/**` | `.pi/<id>/skills/team/<teamId>/**` |
| `.pi/<id>/state/audit.jsonl` | unchanged |
| `.pi/<id>/state/transactions/**` | unchanged |
| `.pi/<id>/workflows/ralplan/agents/<id>.json` | `.pi/<id>/skills/ralplan/executions/<id>.json` |

`piWorkflowRoot` is removed (no longer a concept); `piStateDir` (global `.pi/state`) stays.

### 3.2 Move ralplan agent records to `skills/ralplan/executions/`

In `packages/workflows/src/skills/ralplan/agent-execution.ts`, change the record path from `workflows/ralplan/agents/` to `skills/ralplan/executions/` via `skillExecutionsDir`. Convert the record to a **workflow-owned execution record** that stores only workflow fields (`run_id`, `stage`, `stage_n`, `role`, validation) plus `subagent_id` — do not re-serialize the orchestrator `SubagentRecord` body. Consume the public terminal `SubagentRecord` supplied by the orchestrator hook event; workflows do not instantiate or write an orchestrator store.

### 3.3 Update all consumers

Replace every `#workflows/session/*` import. Shared state, active-state, audit, transaction, artifact-root, and skill-root paths come directly from pi. Ralplan, Deep Interview, Team, and Ultragoal import their skill-owned `paths.ts` modules. Audit and remove every hard-coded legacy segment.

**Files:** `packages/workflows/src/skills/*/paths.ts`, `packages/workflows/src/skills/ralplan/agent-execution.ts`, and every former session-path consumer.

---

## 4. Phase 4 — one-time migration (no version marker)

**Goal:** relocate existing sessions to the new layout; unmigrated sessions are treated as stale.

### 4.1 Add `pi workflow migrate`

New control-plane verb (or a `--migrate` flag on an existing verb) that, per session:

1. Reads the legacy layout.
2. Atomically relocates:
   - `workflows/<skill>/state.json` → `skills/<skill>/state.json`
   - `workflows/active-state.json` → `skills/active-state.json`
   - `plans/ralplan/<runId>/**` → `artifacts/plans/ralplan/<runId>/**`
   - `specs/**` → `artifacts/specs/**`
   - `ultragoal/**` → `skills/ultragoal/**`
   - `team/<teamId>/**` → `skills/team/<teamId>/**`
   - `workflows/ralplan/agents/<id>.json` → `skills/ralplan/executions/<id>.json` (rewrite to execution-record shape)
   - `api-usage.jsonl` → `state/api-usage.jsonl`
3. Writes a migration receipt to the audit log.
4. Treats a second run as a no-op because no legacy sources remain.

**No `layoutVersion` dual-reader or migration marker.** Unmigrated sessions are stale and recoverable. Migration preflights all source/destination conflicts, validates transformations before changing files, and rolls back completed moves if a later move fails.

**Files:** `packages/workflows/src/commands/workflow/migrate.ts` (new), command registration in `packages/workflows/src/commands/workflow.ts` / `src/commands/workflow/`.

---

## 5. Phase 5 — docs, changelog, tests

### 5.1 Docs

Docs were already updated to describe the canonical layout (see `packages/pi/docs/session/layout.md` and cross-links). After implementation, reconcile any doc that still shows a legacy path:
- `packages/workflows/docs/workflow.md` (HUD path already updated).
- `packages/workflows/docs/state/state.md` (already updated).
- `packages/workflows/docs/session/session.md` (already updated).
- `packages/workflows/docs/subagent/subagent.md` (already updated).
- `packages/workflows/docs/source-tree.md` (already updated).
- `packages/pi/docs/session/sessions.md` (already updated).
- `packages/pi/docs/runtime/telemetry/api-usage-logging.md` (update path in Phase 1.3).
- `packages/orchestrator/docs/subagent/index.md` (already updated).

### 5.2 Changelogs

Add entries under `[Unreleased]` → `### Breaking Changes` in:
- `packages/pi/CHANGELOG.md` — new `session/layout` export; `api-usage.jsonl` moved under `state/`.
- `packages/orchestrator/CHANGELOG.md` — subagent store path builder source change (path unchanged).
- `packages/workflows/CHANGELOG.md` — session layout moved to canonical buckets; ralplan agent records → `skills/ralplan/executions/`; `pi workflow migrate` added.

### 5.3 Tests

- `packages/pi/test/session/layout.test.ts` — cover canonical state, artifact, skill, and execution paths.
- `packages/workflows/test/ralplan/agent-execution.test.ts` — update record path + execution-record shape.
- `packages/workflows/test/audit/state-integrity-tamper.test.ts`, `test/team/*`, `test/registry/*` — update any hard-coded legacy paths.
- Add `packages/workflows/test/commands/workflow/migrate.test.ts` — migration correctness, idempotency, conflict preflight, normalization, and rollback.
- `packages/pi/test/` — add `session/layout` path tests; update `api-usage` path test if present.
- `packages/orchestrator/test/subagent/*` — confirm subagent store path unchanged.

---

## 6. Verification

Run from the repo root and package roots. Workspace tests import from the gitignored `dist/`, so **rebuild each package's `dist/` before running `vitest`/`tsgo`**.

```bash
# Per package, after src changes:
cd packages/pi && npm run build
cd packages/orchestrator && npm run build
cd packages/workflows && npm run build

# Root checks:
tsgo --noEmit
biome check --write --error-on-warnings .

# Targeted tests:
cd packages/workflows && npx vitest --run test/commands/workflow/migrate.test.ts test/ralplan/agent-execution.test.ts test/runtime/session-propagation.test.ts
cd packages/pi && npx vitest --run test/session/layout.test.ts
cd packages/orchestrator && npx vitest --run test/subagent/store.test.ts

# Migration dry-run against a copy of session 20260812-035656:
pi workflow migrate --input '{"sessionId":"20260812-035656"}' --dry-run
```

Do **not** run the full `npm run check` gate for routine changes; use biome + tsgo + build + targeted vitest.

---

## 7. Rollout order and rollback

| Step | Action | Gate |
|------|--------|------|
| 1 | Land pi `session/layout` + api-usage path (Phase 1). | pi build + tests green |
| 2 | Land orchestrator store import (Phase 2). | orchestrator build + tests green |
| 3 | Land workflows delegation + execution records (Phase 3). | workflows build + tests green |
| 4 | Land `pi workflow migrate` (Phase 4). | migrate dry-run on a session copy |
| 5 | Docs + changelog + tests (Phase 5). | biome + tsgo + targeted vitest |
| 6 | Run migration on real sessions; verify HUD reads `skills/active-state.json`. | live-run smoke test |

**Rollback:** the command reverses completed moves when a later move fails. Operational rollback can also restore the pre-migration `.pi/<session-id>/` snapshot and revert code in reverse order. There is no version marker or dual reader.

---

## 8. Risks and open items

- **Consumer blast radius.** Mitigated by direct pi imports and skill-owned path modules; no compatibility wrappers remain. Hard-coded legacy segments were removed.
- **HUD path change.** `active-state.json` moves to `skills/`. The reader is `packages/workflows/src/state/active-state.ts` (not TUI directly); update it and confirm the 1s HUD refresh still works.
- **Execution-record shape change.** ralplan `agent-execution.ts` must stop re-serializing the orchestrator record. Confirm no consumer depends on the old `agents/` shape.
- **Migration consistency.** Strict preflight prevents known conflicts; ordered renames are rolled back if a move or audit receipt fails; transformed source records remain untouched until commit.
- **Resolved:** plan directories live under `artifacts/plans/<skill>/<runId>/`; `skills/` contains machine state and execution metadata.

---

## 9. Implementation outcome

Implemented with two codebase-driven refinements:

- Workflows do not retain compatibility wrappers. Shared paths are imported directly from `@tsuuanmi/pi/session/layout`; skill-specific descendants live in each skill's `paths.ts`; the obsolete `src/session/` module was removed.
- Migration uses strict preflight plus rollback-safe path moves rather than a full-session rename. It remains one-time and marker-free: successful reruns are no-ops because no legacy sources remain.

Verification and final implementation details are recorded in the implementing change's final report.
