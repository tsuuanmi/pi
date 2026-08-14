# `.pi` Session Layout Canonicalization Review

**Date:** 2026-08-13

**Package(s):** `packages/workflows` (`@tsuuanmi/pi-workflows`), `packages/orchestrator` (`@tsuuanmi/pi-orchestrator`), `packages/pi` (`@tsuuanmi/pi`)

**Scope:** The runtime-owned `.pi/<session-id>/` artifact tree — how it is currently laid out, why it is inconsistent, and a proposed canonical structure for a production-ready workflow platform.

**Method:** Read-only review. As-built tree inspected for session `20260812-035656`; every path cross-referenced against its authoring module (path builders in `@tsuuanmi/pi/session/root`, `packages/workflows/src/session/session-layout.ts`, `packages/orchestrator/src/subagent/store.ts`, and `packages/pi/src/api/api-usage-utils.ts`). No source code was modified.

**Status:** Historical as-built review. The implementation decisions are finalized in the canonical design and implementation plan.

---

## 1. Executive summary

The `.pi/<session-id>/` directory is the single runtime-owned bucket for every workflow session. It is shared by three packages (pi, orchestrator, workflows), and its layout is determined by several independent path builders rather than one canonical contract. As a result, the tree is internally inconsistent:

1. **Skills are split across two roots.** Each skill keeps its *artifacts* at the session root (or under `plans/`), but its *state* under `workflows/<skill>/`. Example: ultragoal artifacts live in `.pi/<id>/ultragoal/` while ultragoal state lives in `.pi/<id>/workflows/ultragoal/state.json`.
2. **Duplicate top-level folder names.** `plans/ralplan/` (ralplan artifacts) sits beside `workflows/ralplan/` (ralplan state + agent records); `ultragoal/` (artifacts) sits beside `workflows/ultragoal/` (state); `team/` sits beside `workflows/team/`. A newcomer cannot tell `plans/ralplan/` from `workflows/ralplan/` without reading every file.
3. **Subagent/agent records live in two unrelated places.** The orchestrator writes generic subagent records to `.pi/<id>/state/subagent/`, while ralplan writes workflow-specific agent execution records to `.pi/<id>/workflows/ralplan/agents/`. These are near-duplicates with different shapes and no canonical owner.
4. **"State" is fragmented across three containers.** `.pi/<id>/state/` holds audit + transactions + generic subagent records (runtime-owned); `.pi/<id>/workflows/<skill>/state.json` holds per-skill workflow state; `.pi/<id>/workflows/active-state.json` holds the HUD aggregate. There is no single "state" home.
5. **Session-root loose files.** `api-usage.jsonl` sits directly in the session root, mixed with directories, instead of under a log/state bucket.

The fix is a single canonical layout where every skill owns one bucket, every record kind has one home, and the root contains only well-named buckets. Because the layout is runtime-owned and shared across three packages, the change must be driven through the sanctioned `pi workflow` tooling and coordinated across `pi`, `orchestrator`, and `workflows` — never edited by hand.

---

## 2. As-built layout (session `20260812-035656`)

Observed tree (directories and the files that reveal each bucket):

```
.pi/20260812-035656/
├── api-usage.jsonl                     # loose file at session root (pi/src/api/api-usage-utils.ts)
├── plans/
│   └── ralplan/
│       └── ralplan-2026-08-13-0756-35de/          # per-run ralplan plan dir
│           ├── index.jsonl
│           ├── pending-approval.md
│           ├── obstacles.json
│           ├── checkpoints/01-pre-planner.json … 05-critic.json
│           ├── gates/explorer/attempt-01.json
│           ├── stage-01-planner.md … stage-05-final.md
│           └── *.md.completion.json               # completion sidecars
├── state/                                        # sessionStateDir = .pi/<id>/state
│   ├── audit.jsonl                                # audit
│   ├── transactions/                              # transaction journal
│   │   └── ralplan-completion-*.json
│   └── subagent/                                  # orchestrator-owned generic subagent records
│       ├── index.jsonl
│       ├── sessions/<ts>_<id>.jsonl               # subagent session transcripts
│       └── subagent-<id>/
│           ├── record.json
│           └── artifact.json
├── ultragoal/                                    # ultragoal artifacts at session root
│   ├── brief.md
│   ├── goals.json
│   ├── ledger.jsonl
│   └── checkpoints/G001-*.json
└── workflows/
    ├── active-state.json                         # HUD aggregate
    ├── ralplan/
    │   ├── state.json                            # ralplan workflow state
    │   └── agents/ralagent-*.json                # ralplan agent execution records
    └── ultragoal/
        └── state.json                            # ultragoal workflow state
```

Not shown but produced by the same layout module: `.pi/<id>/team/<teamId>/` (team artifacts), `.pi/<id>/specs/` (deep-interview specs), and `.pi/<id>/workflows/team/state.json`, `.pi/<id>/workflows/deep-interview/state.json` (their workflow state).

---

## 3. Path-authoring matrix

The layout is not owned by one module; it is the union of several independent builders. This is the root cause of the inconsistency.

| Bucket | Path | Authoring module |
|--------|------|------------------|
| Session root | `.pi/<id>/` | `pi/session/root.ts` `piSessionRoot` |
| Global `.pi` | `<cwd>/.pi/` | `pi/session/root.ts` `piGlobalRoot` |
| Shared session state | `.pi/<id>/state/` | `pi/session/root.ts` `sessionStateDir` |
| api-usage log | `.pi/<id>/api-usage.jsonl` | `pi/src/api/api-usage-utils.ts` |
| audit | `.pi/<id>/state/audit.jsonl` | `workflows/session/session-layout.ts` `auditLogPath` |
| transaction journal | `.pi/<id>/state/transactions/*.json` | `workflows/session/session-layout.ts` `transactionJournalPath` |
| generic subagent records | `.pi/<id>/state/subagent/**` | `orchestrator/subagent/store.ts` |
| ralplan plan dir | `.pi/<id>/plans/ralplan/<runId>/**` | `workflows/session/session-layout.ts` `ralplanRunDir` |
| deep-interview specs | `.pi/<id>/specs/**` | `workflows/session/session-layout.ts` `piSpecsDir` |
| ultragoal artifacts | `.pi/<id>/ultragoal/**` | `workflows/session/session-layout.ts` `ultragoalDir` |
| team artifacts | `.pi/<id>/team/<teamId>/**` | `workflows/session/session-layout.ts` `teamDir` |
| workflow state | `.pi/<id>/workflows/<skill>/state.json` | `workflows/session/session-layout.ts` `workflowStatePath` |
| HUD aggregate | `.pi/<id>/workflows/active-state.json` | `workflows/session/session-layout.ts` `workflowActiveStatePath` |
| ralplan agent records | `.pi/<id>/workflows/ralplan/agents/*.json` | `workflows/skills/ralplan/agent-execution.ts` `recordRalplanAgentExecution` |

Three packages and five builder modules contribute to one tree, with no single "canonical layout" document enforcing consistency.

---

## 4. Problems found

### 4.1 (High) Skills are split across two roots
- `ralplan`: artifacts under `plans/ralplan/`, state under `workflows/ralplan/`, agent records under `workflows/ralplan/agents/`.
- `ultragoal`: artifacts under `ultragoal/`, state under `workflows/ultragoal/`.
- `team`: artifacts under `team/`, state under `workflows/team/`.
- `deep-interview`: specs under `specs/`, state under `workflows/deep-interview/`.

The "skill" concept is not a single directory; it is a scattered set. For the goal of a canonical workflow, a skill should be one addressable unit so lifecycle, audit, recovery, and cleanup can operate on a single subtree.

### 4.2 (High) Duplicate / confusing folder names
- `plans/ralplan/` vs `workflows/ralplan/` — both are "ralplan" folders with different contents.
- `ultragoal/` vs `workflows/ultragoal/` — same clash.
- `team/` vs `workflows/team/` — same clash.

This is the "duplicate ralplan and ultragoal folder" reported. It is not a hard file collision (they are distinct subtrees), but it is a serious navigational and tooling hazard: recursive globs, cleanup, GC, and human readers can easily confuse one for the other.

### 4.3 (High) Subagent/agent records in two unrelated locations
- Orchestrator-owned generic subagents: `.pi/<id>/state/subagent/{subagent-<id>/{record,artifact}.json, sessions/*.jsonl, index.jsonl}`.
- Workflow-owned ralplan agents: `.pi/<id>/workflows/ralplan/agents/{ralagent-<id>.json}`.

The ralplan file is derived from the same underlying `SubagentRecord` (`recordRalplanAgentExecution`), but re-serialized into a new shape in a new location, referencing the orchestrator artifact via `runtime_artifact_path`. This duplicates provenance and splits the "where do agent records live?" answer in two. Either the generic subagent store is the canonical home and ralplan reads from it, or there is one unified agent-record bucket under the workflow tree.

### 4.4 (Medium) "State" is fragmented
Three different containers hold "state": `.pi/<id>/state/` (audit + transactions + subagents), `.pi/<id>/workflows/<skill>/state.json` (per-skill), and `.pi/<id>/workflows/active-state.json` (HUD). There is no single mental model for "where is session state", which complicates backup, restore, and GC.

### 4.5 (Medium) Session-root loose file
`api-usage.jsonl` sits directly in `.pi/<id>/` beside directories. It is the only loose file at the root and is easy to miss in tooling that globs directories.

### 4.6 (Low) Asymmetric skill naming
`plans/`, `specs/`, `ultragoal/`, `team/`, `workflows/`, `state/` mix three schemes: plural-content buckets (`plans/`, `specs/`, `workflows/`, `state/`), skill-name buckets (`ultragoal/`, `team/`), and a nested skill bucket (`plans/ralplan/`). The asymmetry makes the layout hard to reason about and hard to document succinctly.

---

## 5. Proposed canonical layout

A single, uniform, skill-first layout with one home per record kind. Artifacts, state, and agent records for a skill live under one `skills/<skill>/` bucket; shared runtime-owned records live under `state/`; plan/spec artifacts are grouped under `artifacts/`.

```
.pi/<session-id>/
├── state/                          # shared session state, one container
│   ├── audit.jsonl
│   ├── transactions/               # transaction journal
│   ├── subagent/                   # orchestrator-owned generic subagent records (canonical home)
│   └── api-usage.jsonl             # folded in from session root (currently api-usage.jsonl at root)
├── artifacts/                      # durable artifacts for all skills
│   ├── plans/<skill>/<runId>/**    # ralplan plan dirs (moved from plans/ralplan/)
│   └── specs/<slug>.md             # deep-interview specs (moved from specs/)
└── skills/                         # one bucket per skill: artifacts + state + agent records
    ├── active-state.json           # HUD aggregate (moved from workflows/active-state.json)
    ├── ralplan/
    │   ├── state.json
    │   ├── agents/                 # ralplan agent records (unified with state/subagent provenance)
    │   └── ...                     # or kept under state/subagent and referenced
    ├── ultragoal/
    │   ├── state.json
    │   ├── brief.md / goals.json / ledger.jsonl / checkpoints/
    ├── team/
    │   ├── state.json
    │   └── <teamId>/**
    └── deep-interview/
        └── state.json
```

Design rules the canonical layout should encode:

1. **One root per concept.** A skill is one `skills/<skill>/` subtree. Its artifacts and state never split across roots.
2. **One home per record kind.** Subagent/agent records have exactly one canonical store. If ralplan agent records must persist a workflow-specific shape, they either (a) become a projection derived from the orchestrator `state/subagent` store, or (b) move into a single `skills/<skill>/agents/` home and stop duplicating the orchestrator record.
3. **Root has only well-named buckets.** No loose files; `api-usage.jsonl` moves under `state/` (or a `logs/` bucket).
4. **Shared, not skill-owned, records stay together.** Audit, transactions, and generic subagents remain under `state/`, decoupled from workflow skill directories.
5. **The layout is a single documented contract.** One authoritative path module (or a shared `@tsuuanmi/pi/session/layout` module) owns every path, and the "canonical layout" is documented in one place that all three packages reference, rather than five ad-hoc builders.

---

## 6. Migration considerations

Because `.pi` is runtime-owned, this cannot be a hand edit:

- **Route through sanctioned tooling.** Any layout change must be applied by the `pi` workflow code and the `pi workflow ...` control plane, not by editing `.pi/**` directly. A migration would need a versioned layout contract, a state-format bump, and a tool command (or auto-migration on session open) to relocate existing sessions (`20260812-035656` and any others).
- **Cross-package coordination.** Path builders live in `pi` (`session/root.ts`, `api-usage-utils.ts`), `orchestrator` (`subagent/store.ts`), and `workflows` (`session/session-layout.ts`). A canonical layout requires moving the path ownership into one shared module or at least one documented contract with a single source of truth.
- **Migration safety.** This review originally considered a version marker and dual reader. The implemented decision instead uses a one-time, marker-free migration with strict conflict preflight and rollback-safe moves; legacy paths are not supported at runtime.
- **Docs and changelog.** `docs/session/session.md`, `docs/state/state.md`, `docs/subagent/subagent.md`, `docs/source-tree.md`, and `docs/workflow.md` all describe the current layout and must be updated with the canonical structure. Package changelogs (`packages/workflows/CHANGELOG.md`, `packages/orchestrator/CHANGELOG.md`, `packages/pi/CHANGELOG.md`) should record the breaking layout change.
- **Tests.** `test/session/` and any path-resolution tests assert the current paths and must be updated. Because workspace tests import from the gitignored `dist/`, rebuild each affected package before running `vitest`/`tsgo`.

### Recommended sequencing (for the eventual implementation, not done here)

| # | Step | Priority | Risk |
|---|------|----------|------|
| 1 | Centralize path ownership into one shared layout module + a documented canonical contract. | High | High — wide import surface across 3 packages |
| 2 | Fold `api-usage.jsonl` under `state/` (or `logs/`). | Low | Low |
| 3 | Unify ralplan agent records with the orchestrator `state/subagent` store (single canonical home). | High | Medium — reconcile record shape / provenance |
| 4 | Consolidate `plans/ralplan/`, `specs/`, `ultragoal/`, `team/` into `artifacts/` + `skills/<skill>/` buckets. | High | High — migrate existing sessions |
| 5 | Add one-time `pi workflow migrate` with conflict preflight and rollback-safe moves; do not add a version marker or dual reader. | High | High — must not corrupt in-flight runs |
| 6 | Update docs, changelogs, and tests to match. | Medium | Low |

---

## 7. Summary

The `.pi/<session-id>/` tree is functionally correct but structurally inconsistent. The concrete issues the user reported — duplicate `ralplan`/`ultragoal` folders and the "workflow also uses the subagent folder" overlap — are real: each skill is split across `plans/`+`workflows/` or `ultragoal/`+`workflows/`, and subagent/agent records are written to both `state/subagent/` (orchestrator) and `workflows/ralplan/agents/` (workflow). For a canonical, production-ready workflow platform, the layout should be a single documented contract with one root per skill, one home per record kind, and no loose session-root files, applied through the sanctioned `pi` tooling so existing sessions migrate cleanly.

No source code was changed by this review.
