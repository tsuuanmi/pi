# `@tsuuanmi/pi-workflows` Filename Consistency Review

**Date:** 2026-08-12

**Package:** `packages/workflows` (`@tsuuanmi/pi-workflows`)

**Scope:** Every module file under `src/` — naming clarity, conciseness, and adherence to the repository's module-naming standard.

**Status:** Baseline is consistent and accurate; no names are misleading. Several standards violations and consistency nits are worth addressing for uniformity.

---

## 1. Naming standard in force

From `AGENTS.md` (repo-wide) and the observed codebase conventions:

- Files are **lowercase-kebab-case** (`event-store.ts`, `gate-verdicts.ts`, `orchestration-snapshot.ts`).
- Domain nouns use full words; standard project abbreviations (`jsonl`, `hud`, `rpc`, `gc`) are used when they match the domain.
- Responsibility nouns follow a consistent suffix pattern:
  - `-store.ts` / `-mapper.ts` / `-adapter.ts` / `-contract.ts` / `-model.ts` / `-types.ts` / `-rules.ts` / `-policy.ts` / `-snapshot.ts`.
- A module exposing the skill's immutable rules is `policy.ts`; a module exposing command/tool surface metadata is `surface.ts`; HUD rendering is `hud.ts`; tool registration is `tools.ts`; shared domain types are `types.ts`.

The tree follows this standard consistently. The remainder of this document records what is already consistent (Section 2), the genuine inconsistencies (Section 3), intentional duplicates (Section 4), and cross-layer overlaps that are acceptable but worth a note (Section 5). A prioritized change plan closes the document (Section 6).

---

## 2. What is already consistent (keep)

### 2.1 The per-skill skeleton is uniform

Every one of the four skills (`deep-interview/`, `ralplan/`, `team/`, `ultragoal/`) exposes the identical core set, with identical meaning:

| File | Meaning |
|------|---------|
| `help.ts` | Command-action help metadata. |
| `hud.ts` | HUD chip rendering. |
| `policy.ts` | Immutable skill policy + fail-closed validators. |
| `surface.ts` | Validated command / model-visible tool surface metadata. |
| `tools.ts` | Registers the skill's model-visible tools. |
| `types.ts` | Skill domain types. |

### 2.2 Consistent cross-skill suffix sets

- ralplan + team both use `agent-adapter.ts`, `checkpoint-store.ts`, `orchestrator.ts`, `gates.ts`, `guards.ts` (see 3.1 for the ultragoal exception), `obstacles.ts` (see 3.2 for the ultragoal exception).
- team's `-mapper` set: `event-mapper.ts`, `receipt-mapper.ts`, `status-mapper.ts`, `task-mapper.ts`.
- team's `role-*` set: `role-contract.ts`, `role-run-store.ts`, `role-tasks.ts`, `role-transitions.ts`.
- team's `execution-*` set: `execution-applier.ts`, `execution-failure.ts`, `execution-store.ts` (the bare `execution.ts` breaks the set — see 3.3).
- deep-interview's `mutation-*` set: `mutation-guard.ts`, `mutation-paths.ts`, `mutation-targets.ts`.
- ralplan's `agent-*` set: `agent-adapter.ts`, `agent-record.ts`, `agent-roles.ts`.
- ultragoal's `plan-*` tri-set: `plan.ts`, `plan-model.ts`, `plan-store.ts`.
- shared top-level two-by-two: `workflow-help-registry.ts` / `workflow-help-types.ts`, `workflow-surface-registry.ts` / `workflow-surface-types.ts`.
- `state/` modules share an `-state`/`state-` pattern: `active-state.ts`, `workflow-state.ts`, `state-schema.ts`, `state-writer.ts`.
- `runtime/` responsibility nouns: `receipt-rules.ts`, `recovery-policy.ts`, `workspace-marker.ts`, `finalization.ts`, `preservation.ts`.

---

## 3. Genuine inconsistencies (recommend changing)

Ordered by how much they affect clarity/standards.

### 3.1 `guard.ts` vs `guards.ts` — pluralization mismatch across skills

- `deep-interview/guards.ts` and `ralplan/guards.ts` are plural.
- `ultragoal/guard.ts` is singular.

This is the only singular/plural flip in the tree. The content differs (ultragoal's `guard.ts` is a full passive 9-state diagnostic service reading plan + ledger; the other two are small assertion helpers), but the filename clash is a standards violation.

**Recommendation:** rename `ultragoal/guard.ts` → `guard-diagnostics.ts` (preferred, signals the passive diagnostic surface and mirrors the `obstacles.ts`/`obstacle-service.ts` split) or → `guards.ts` (simplest, matches the other two skills).

### 3.2 `obstacle-service.ts` (ultragoal) — the only `-service` suffix in the tree

`obstacle-service.ts` and `obstacles.ts` split the ultragoal obstacle model from its mutation service. The split is legitimate and documented, but no other file uses a `-service` suffix.

**Recommendation:** rename to `obstacles-service.ts` (parallel with `obstacles.ts`) or `obstacle-records.ts` to drop the non-standard suffix.

### 3.3 `execution.ts` (team) — bare name among three `execution-*` siblings

`execution.ts`, `execution-applier.ts`, `execution-failure.ts`, `execution-store.ts`. The bare `execution.ts` (the orchestrator runner) reads ambiguously next to its three `execution-*` siblings; a reader cannot tell it is the runner.

**Recommendation:** rename `execution.ts` → `execution-runner.ts` (or `runner.ts`) so the set is self-documenting.

### 3.4 Umbrella `store.ts` (team, deep-interview) vs the `*-store` siblings

- team has `store.ts` (config/task/event/active-team umbrella) next to `event-store.ts`, `receipt-store.ts`, `role-run-store.ts`, `execution-store.ts`, `checkpoint-store.ts`.
- deep-interview has `store.ts` (session-scoped persistence + active-state sync) with no siblings.

The umbrella `store.ts` does not match the suffix pattern used by its siblings.

**Recommendation:** rename team `store.ts` → `team-store.ts` and deep-interview `store.ts` → `deep-interview-store.ts` (or `interview-store.ts`).

### 3.5 File/directory name collisions

Three places pair a `*.ts` file with a same-named directory, which confuses newcomers and is fragile on case-insensitive filesystems:

1. `commands/workflow.ts` + `commands/workflow/` directory. `workflow.ts` is a re-export barrel over `commands/workflow/index.ts`.
2. Skill-local `policy.ts` files (four of them) coexist with the top-level `policy/` directory. The top-level dir is shared policy (`skill-policy.ts`, `expected-next-role.ts`, `gate-verdicts.ts`, `vagueness-gate.ts`, `context-templates.ts`); the per-skill `policy.ts` files are a different thing. The overlap of `policy.ts` (file) and `policy/` (dir) is the same pattern as #1.
3. `artifacts/artifacts.ts` + `artifacts/` directory (file inside its own directory) — the common barrel-in-own-dir pattern; mild.

The skill `policy.ts` files are a deliberate standard and should stay; the collision is with the top-level `policy/` directory name, not between skills. This is inherent to the "immutable skill policy" convention and is acceptable once understood — but the `commands/workflow.ts`/`commands/workflow/` pairing is the sharpest edge.

**Recommendation:** resolve the `commands/workflow.ts` + `commands/workflow/` pairing (drop the top-level barrel and route imports straight to `commands/workflow`, or rename the folder to `commands/workflow-command/`). Leave the `policy.ts` files as-is (documented standard); the `policy/` dir vs `policy.ts` file overlap is worth a note in `docs/source-tree.md` but not a rename.

### 3.6 Abbreviation-only module names (runtime)

`runtime/gc.ts` and `runtime/rpc.ts` are abbreviation-only, while their neighbors use full-word nouns (`finalization.ts`, `preservation.ts`, `lease.ts`, `storage.ts`, `mutation.ts`). The abbreviations match the domain (GC sweep, RPC layer) and appear in the CLI/`pi workflow gc`, so they are defensible.

**Recommendation (optional):** `gc.ts` → `garbage-collection.ts` for full-word consistency; `rpc.ts` is an established protocol name and is fine. Low priority.

---

## 4. Intentional / acceptable duplicates (do not change)

Duplicated basenames across directories are **expected** here because each is namespaced by its parent directory and documented in `docs/skills/*/index.md`. Confirmed intentional:

| Basename | Locations | Reason it is fine |
|----------|-----------|-------------------|
| `types.ts` | 6 dirs (incl. `quality-gate/types.ts`) | Local type namespaces per layer. |
| `surface.ts` | 4 skills + `tool/surface.ts` | Per-skill surface + shared tool surface. |
| `hud.ts` | 4 skills + `state/hud.ts` | `state/hud.ts` is the shared HUD reader. |
| `tools.ts` | 4 skills | Skill tool registration. |
| `policy.ts` | 4 skills | Skill immutable policy (see 3.5 for the dir overlap). |
| `help.ts` | 4 skills | Skill help metadata. |
| `validation.ts` | `runtime/`, `team/`, `quality-gate/` | Distinct validators in distinct layers. |
| `artifacts.ts` | `artifacts/`, `ralplan/`, `ultragoal/` | Shared + per-skill artifact modules. |
| `spec.ts` | `deep-interview/`, `tool/` | Skill spec vs tool spec contract. |
| `orchestrator.ts` | `ralplan/`, `team/` | Parallel guarded orchestrator adapters. |
| `obstacles.ts` | `ralplan/`, `ultragoal/` | Parallel obstacle models (distinct schemas). |
| `gates.ts` | `ralplan/`, `team/` | Parallel gate validation. |
| `checkpoint-store.ts` | `ralplan/`, `team/` | Parallel checkpoint persistence. |
| `agent-adapter.ts` | `ralplan/`, `team/` | Parallel agent adapters. |
| `index.ts` | root, `commands/workflow/`, `tool/` | Standard barrels. |

---

## 5. Cross-layer overlaps (acceptable, but worth documenting)

Two ralplan module names pair with shared `policy/` modules that have related names:

- `ralplan/expected-action.ts` ↔ `policy/expected-next-role.ts`.
- `ralplan/verdicts.ts` ↔ `policy/gate-verdicts.ts`.

These are distinct responsibilities (skill-local action/verdict logic vs shared policy) and are documented, but the near-identical naming can slow a reader.

**Recommendation:** leave as-is; add a one-line disambiguation in `docs/skills/ralplan/index.md` and `docs/source-tree.md` noting each ralplan module is skill-owned while the `policy/` module is the shared policy.

---

## 6. Prioritized change plan

| # | Change | Priority | Risk |
|---|--------|----------|------|
| 1 | Rename `ultragoal/guard.ts` → `guard-diagnostics.ts` (or `guards.ts`). | High (standards) | Medium — update imports, `SKILL.md`, docs. |
| 2 | Rename `ultragoal/obstacle-service.ts` → `obstacles-service.ts` (or `obstacle-records.ts`). | Medium (standards) | Medium — update imports, docs. |
| 3 | Resolve `commands/workflow.ts` + `commands/workflow/` collision (drop barrel or rename dir). | Medium (clarity) | High — wide import surface; verify all `#workflows/commands/...` refs. |
| 4 | Rename team `execution.ts` → `execution-runner.ts`. | Low (consistency) | Medium — update imports, docs. |
| 5 | Rename team `store.ts` → `team-store.ts` and deep-interview `store.ts` → `deep-interview-store.ts`. | Low (consistency) | Medium — update imports, docs. |
| 6 | Optionally `runtime/gc.ts` → `garbage-collection.ts`. | Low (optional) | Low — update imports, CLI verb docs. |

### Required verification for any rename

Because workspace tests import from the gitignored `dist/`, and docs reference `src/skills/*/`, every rename must:

1. Update all `#workflows/...` imports — use `lsp` `references` on the target symbol, not textual search.
2. Update the module tables in `docs/skills/<skill>/index.md`, the corresponding `SKILL.md`, and `docs/source-tree.md`.
3. Rebuild the package `dist/` (`npm run build`) before `vitest` or `tsgo`.
4. Run `tsgo --noEmit`, `biome check --write --error-on-warnings .`, and targeted `vitest` on the touched package.

---

## 7. Out-of-scope note (docs drift)

While reviewing, a doc-vs-code drift surfaced (not a filename issue): `README.md` and this package's docs list `session/session-resolution.ts`, but no such file exists and nothing references it. Recommend removing the stale reference when next touching `docs/source-tree.md` / `README.md`.

---

## 8. Summary

The `src/` module tree is clear, concise, and overwhelmingly consistent. The genuine fixes worth making are small and localized: **guard/guards pluralization (3.1)**, the lone **`-service` suffix (3.2)**, the **bare `execution.ts` (3.3)**, the **umbrella `store.ts` (3.4)**, and the **`commands/workflow.ts`/`commands/workflow/` collision (3.5.1)**. All other duplicates are intentional and namespaced. No name is misleading today; the recommended changes harden the standard rather than repair a defect.
