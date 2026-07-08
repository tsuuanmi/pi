# Obstacle-ledger migration — decision memo

**Status:** scaffolding complete; one behavior change live; the payoff cuts are
**not** shipped and need a human decision. No code should be written past this
point until that decision is made.

**Companion docs:** `decision-ledger-design.md` (full design + phased migration),
`deep-interview-phases.md` (deep-interview detail). This memo is the short
decision-oriented summary.

---

## TL;DR

We set out to unify how Pi's three skills (deep-interview, ralplan, ultragoal)
track "something needs attention," by giving them one shared, typed **obstacle
ledger** (a durable record with kind/status/scope/lifecycle) instead of three
private ad-hoc mechanisms. We built the full **additive scaffolding** for ralplan
and ultragoal and shipped **one genuine correctness fix**. Everything that remains
is a **behavior-changing "make obstacles the boss" cut** — the actual payoff —
and I'm declining to make those cuts unilaterally because the value is speculative
and the risk is real. This memo exists so a human owns that call.

---

## What shipped

### The one behavior change (live, user-visible)
**ralplan approval now refuses to approve a plan the latest critic REJECTed.**
- `approveRalplanPlan` throws on latest critic verdict = REJECT; overridable via
  the new `overrideCriticVerdict` option. ITERATE produces a soft warning; APPROVE
  / no-critic proceed silently (backward compat). Rejections (`approved: false`)
  bypass the gate.
- `ralplan_doctor` warns when a pending plan's latest critic verdict is REJECT /
  ITERATE.
- **Why it matters:** previously the runtime approved *any* pending plan
  regardless of the critic's verdict — the orchestrator was *supposed* to only
  write `final` after the critic approved, but nothing enforced it. This closes
  that gap.
- **This is the only user-visible behavior change in the whole effort.**

### Everything else is additive scaffolding (no behavior change)
All of the below writes records / adds dev-only assertions / fails soft. In
production it changes nothing observable beyond the gate above.

- **Shared core** (`shared/decision-ledger.ts`): the `ObstacleTrigger` /
  `ObstacleInput` types, `validateObstacles` integrity wall,
  `ObstacleKindRegistry` (registry-aware regression skip). Pure, standalone.
- **deep-interview adapter** (`deep-interview-state.ts`): the existing
  transition validator now delegates to `validateObstacles` via adapter
  functions. **Zero behavior change** — same rules, structured violations.
- **ralplan verdict parsing** (`ralplan-verdicts.ts`): `parseRalplanVerdict`
  (critic APPROVE/ITERATE/REJECT; architect clarity + recommendation) +
  `isRalplanVerdict`. Fail-open, precision-biased (never throws; returns
  `undefined` when unsure). `writeRalplanArtifact` stamps the parsed verdict on
  the durable index row + write result.
- **ralplan obstacle ledger** (`ralplan-obstacles.ts`): 5 kinds
  (`plan_rejected` / `revision_required` / `architect_block` / `scope_drift` /
  `contract_contradiction`), R-1 subset validator, verdict→obstacle mapping,
  per-run ledger I/O (fail-soft read), closure query. `writeRalplanArtifact`
  **dual-writes** an obstacle for each parsed blocker verdict — **fail-soft**
  (warns + swallows; can never break the artifact/index write path), skipped on
  dedup and for planner/revision/final stages.
- **ralplan agreement** (R-2): `approveRalplanPlan` + `doctorRalplan` read the
  ledger alongside the verdict and assert agreement — **dev-throw / prod-warn**
  in approve (only when the ledger is non-empty, so the pre-R-1 / fail-soft
  empty case never blocks), warning in doctor. Scoped to the **latest critic
  pass's artifact** so stale obstacles from earlier revision passes (R-1 never
  resolves them) don't read as divergence.
- **ultragoal obstacle ledger** (`ultragoal-obstacles.ts` + `ultragoal-runtime.ts`
  `recordUltragoalObstacle`): the B-0 dual-write — validates via the wall *before*
  the legacy review-blocker path, then writes both. 5 kinds. Guard/checkpoint
  untouched.
- **ultragoal agreement** (B-1, `ultragoal-guard.ts`): the guard asserts the
  obstacle ledger agrees with the legacy `review_blockers_recorded` graph-walk —
  dev-throw / prod-warn, only when the ledger is non-empty. Legacy path (empty
  ledger) stays authoritative and unchanged.

### Verification
- **257 tests across 23 files pass** (new: decision-ledger 17, ultragoal-obstacles
  9, ultragoal-obstacles-guard 3, ralplan-verdicts 26, ralplan-verdicts-integration
  5, ralplan-approve-gate 9, ralplan-obstacles 20, ralplan-obstacles-dualwrite 7,
  ralplan-obstacles-agreement 8; plus all existing deep-interview / ultragoal /
  ralplan / shared regression unchanged). tsgo + biome clean. `dist` rebuilt.
- No `.bak` in repo; nothing staged; no commits. Backups in
  `/tmp/agent-backups/{phase-a-decision-ledger,phase-b0-ultragoal,phase-b1-guard,
  r1-verdicts,r2-approve-gate}/`.

---

## What did NOT ship (the gap)

The scaffolding writes obstacles and verifies them, but **nothing reads them to
make a decision.** The skills still decide from their original logic; the
obstacle ledger is a secondary copy. The value of unification lands only when
obstacles become **authoritative**:

- **R-3 (ralplan authoritative):** revision routing (ITERATE→revise,
  REJECT→re-plan, BLOCK→decide) driven by obstacle `kind`/`status`; the verdict
  text in artifacts becomes a *view* derived from obstacles, not the source of
  truth. **Not shipped.**
- **B-2 (ultragoal authoritative):** the ultragoal mirror — obstacles drive the
  guard/checkpoint instead of the legacy graph-walk. **Not shipped.**
- **R-4 / B-4 (cross-skill contract):** a plan contradicting the deep-interview
  spec gets flagged as `contract_contradiction` via a shared Tier-2 contract
  ledger. **Not started** (`contractLedgerPath` was chosen in `session-layout`
  but is unused). Most speculative, furthest away.

---

## The decision a human needs to make

> **Resolved (2026-07-07):** (1) keep the approval gate; (2) stop — do not pursue R-3/B-2;
> (3) leave the additive scaffolding in place. The CHANGELOG entry was written and
> the work was committed. The recommendations below are the original framing, kept
> for the record.

### 1. Keep the approval-gate behavior change?
**Recommend: keep.** It's a real correctness fix (no more silently approving a
critic-rejected plan), it has an override for legitimate human override, and
it's isolated. If undesired, it can be reverted in isolation (see Rollback).

### 2. Proceed to R-3 / B-2 (authoritative), or stop here?
This is the real call. Tradeoff:

| | Gain | Risk |
|---|---|---|
| **R-3** | ralplan gets durable, queryable, typed rejection history; closure parity (approve = critic APPROVE **and** no unresolved obstacles); typed resolution paths; the unified model finally pays off for ralplan. | Behavior-changing. The dual-write + agreement net is proven on **tests**, not on **real multi-revision plans**. Flipping obstacles to authoritative could surface latent bugs or change how real plans flow. The verdict-as-view rewrite touches the approval/revision hot path. |
| **B-2** | ultragoal gets the same unified model; obstacles drive the guard. | Behavior-changing. B-1's divergence check is one-directional and unproven on real plans. |
| **R-4/B-4** | Cross-skill plan/spec contradiction surfacing — the original "ROI prize." | Most speculative; depends on R-3/B-2 landing first. |

**Recommend: stop.** The scaffolding is done; the remaining cuts are all
behavior-changing, and their value is **speculative** (we'd be building the
unified model on the assumption it's wanted, not because a concrete plan/goal
flow has exposed a gap the obstacles would fix). Revisit R-3/B-2 **only when a
real flow shows a problem the obstacle model would solve** — at that point the
scaffolding is already in place to make the cut safer.

### 3. If we stop: leave the scaffolding, or remove it?
**Recommend: leave it.** It is purely additive and behavior-preserving (the only
observable change is the approval gate from question 1). Leaving it in place is
harmless and keeps the foundation if R-3/B-2 is ever revisited. Removing it would
discard ~257 tests of coverage and the correctness fix's foundation for no gain.

---

## Resolution

The three decisions were made on 2026-07-07:

1. **Keep the approval gate** (it is a real correctness fix with an override).
2. **Stop** — do not pursue R-3/B-2 (authoritative cuts) now; revisit only when a
   real plan/goal flow exposes a gap the obstacle model would solve.
3. **Leave the additive scaffolding** in place (behavior-preserving; foundation
   if revisited).

The `packages/workflows/CHANGELOG.md` entry for the approval gate was written
under `[Unreleased]` (scope `ralplan`), and the ralplan `SKILL.md` approval step
was updated to document the new critic-verdict enforcement. The full change set
(gate + scaffolding + tests + these docs) was committed.

---

## Rollback (if needed)

- **Approval gate only:** the gate is isolated to `approveRalplanPlan`
  (REJECT-throw + override) and the `doctorRalplan` REJECT/ITERATE warnings in
  `ralplan-runtime.ts`, plus the `overrideCriticVerdict` schema field in
  `ralplan-tools.ts`. Revert those blocks to restore "approve anything." The
  parsed-verdict and obstacle-scaffolding code is independent and can stay.
- **All obstacle scaffolding:** purely additive. The ledgers are new files
  (`obstacles.json`); removing the code stops writing them with no data
  migration. Existing ralplan index rows keep the additive `verdict` JSON field
  (harmless extra; `parseRalplanIndexLine` drops malformed verdicts). The
  deep-interview adapter delegates to the same `validateObstacles` rules it
  always enforced — reverting it just inlines those rules again.
- **No data loss in any case** — nothing migrates existing data; everything is
  new files / additive JSON fields.

---

## Open action for a human

- **CHANGELOG:** done. `packages/workflows/CHANGELOG.md` was created with the
  `[Unreleased]` entry for the approval gate (scope `ralplan`), and the ralplan
  `SKILL.md` approval step now documents the critic-verdict enforcement. See the
  Resolution section above.

---

## Files touched (for reference)

**Code (src):** `shared/decision-ledger.ts` (new), `shared/session-layout.ts`
(+`ralplanObstacleLedgerPath`), `deep-interview/deep-interview-state.ts`
(adapter), `ralplan/ralplan-verdicts.ts` (new), `ralplan/ralplan-obstacles.ts`
(new), `ralplan/ralplan-runtime.ts` (verdict stamp + dual-write + approval gate
+ R-2 agreement + doctor warnings), `ralplan/ralplan-tools.ts`
(`overrideCriticVerdict` + surfaced verdict/warning), `ultragoal/
ultragoal-obstacles.ts` (new), `ultragoal/ultragoal-runtime.ts`
(`recordUltragoalObstacle` dual-write), `ultragoal/ultragoal-guard.ts` (B-1
agreement), `index.ts` (barrel exports).

**Tests:** `shared/decision-ledger.test.ts`, `ralplan/ralplan-verdicts.test.ts`,
`ralplan/ralplan-verdicts-integration.test.ts`, `ralplan/ralplan-approve-gate.test.ts`,
`ralplan/ralplan-obstacles.test.ts`, `ralplan/ralplan-obstacles-dualwrite.test.ts`,
`ralplan/ralplan-obstacles-agreement.test.ts`, `ultragoal/ultragoal-obstacles.test.ts`,
`ultragoal/ultragoal-obstacles-guard.test.ts`.

**Docs:** `decision-ledger-design.md`, `deep-interview-phases.md`,
`obstacle-migration-decision-memo.md` (this file).