# Decision Ledger + Typed Obstacles — Design Sketch

> **Status (2026-07-07):** the additive scaffolding is implemented and verified
> (shared `decision-ledger.ts`; deep-interview adapter = Phase A; ralplan verdict
> parsing + obstacle dual-write = R-1 prereq + R-1; ralplan approval-gate = the one
> shipped behavior change; R-2 + B-1 agreement dev-asserts; ultragoal dual-write =
> B-0). The authoritative cuts (R-3 / B-2) and the cross-skill contract (R-4 / B-4)
> are **not** shipped — see `obstacle-migration-decision-memo.md` for the decision.
> 257 tests across 23 files pass.

Generalize deep-interview's three proven primitives — append-only decision facts,
typed status-bearing obstacle triggers, and the runtime integrity wall — into a
skill-agnostic shared module, then migrate ultragoal's binary review blockers and
ralplan's transient verdicts onto it.

This is a **design sketch, not an implementation**. Types and operations are
matched to Pi's actual harness:

- `DeepInterviewEstablishedFact`, `DeepInterviewTriggerMetadata`,
  `validateDeepInterviewScoredTransition` in
  `packages/workflows/src/harness/deep-interview/deep-interview-state.ts`
- ultragoal `recordUltragoalReviewBlockers` / `recordUltragoalBlockerClassification`,
  `steering: { kind: "review_blocker", blockedGoalId }`,
  `UltragoalBlockerClassification = "human_blocked" | "resolvable"` in
  `packages/workflows/src/harness/ultragoal/ultragoal-runtime.ts`
- `WorkflowSkill` closed union and session-scoped path builders in
  `packages/workflows/src/harness/shared/paths.ts` / `session-layout.ts`

Verification points flagged inline must be confirmed against full files before coding.

---

## Why

The deep-interview ambiguity engine is the highest-ROI-to-port part of Pi. It already
contains, in microcosm and battle-tested, the three things identified as Pi's best ROI
borrows from the `pi.md` General Team design:

1. **Append-only decision facts** — the "versioned task contract" pattern, but durable.
2. **Typed, resolvable obstacles** — a stronger "abort / needs_replan" signal than a flag.
3. **Math-done ≠ coverage-done** — the closure-vs-threshold split, stated cleanly.

Lifting these one layer up lets ralplan and ultragoal share the same durable-decision /
typed-obstacle / integrity-gated guarantees deep-interview already enjoys — without
touching deep-interview's scoring formula or ultragoal's quality gate.

---

# Part 1 — Shared module: `shared/decision-ledger.ts`

## Goals and non-goals

**Goals**
- Lift deep-interview's three proven primitives into a skill-agnostic core:
  (1) append-only decision facts, (2) typed, status-bearing obstacle triggers,
  (3) the runtime integrity wall that makes both non-fakeable.
- Let each skill plug in its own `kind` set and its own regression metric, while the
  shared module owns storage, lifecycle, and the closure query.
- Enable a cross-skill contract memory (the "versioned task contract"): one durable
  decision/obstacle ledger that deep-interview, ralplan, and ultragoal all read.

**Non-goals**
- Not changing deep-interview's scoring *formula* or threshold — skill-specific, stays
  in deep-interview.
- Not replacing ultragoal's quality gate or ledger — obstacles layer *under* them.
- Not a new mutation surface for agents — the ledger is mutated only via sanctioned
  workflow tools, never by `edit`/`write` (the existing `.pi/**` always-on block
  already covers it).

## Core types

Generalized from `DeepInterviewEstablishedFact` + `DeepInterviewTriggerMetadata`,
keeping deep-interview's field names as aliases for a zero-friction adapter.

```ts
// A durable, evidenced decision. Append-only: never deleted; disputed, not removed.
export interface DecisionFact {
  id: string;
  statement: string;
  originSkill: WorkflowSkill;            // who established it
  originRef: string;                      // round id / stage id / goal id
  scope: DecisionScope;                  // what it applies to
  evidence?: string;
  disputed: boolean;
  supersededBy?: string;                 // id of the fact that replaced it (explicit reversal)
  createdAt: string;
}

export interface DecisionScope {
  component?: string;                    // deep-interview topology component
  dimension?: string;                    // goal | constraints | criteria | context
  goalId?: string;                       // ultragoal goal
  criterion?: string;                    // ultragoal quality-gate criterion
  planRef?: string;                      // ralplan stage/adr
}

// A typed, resolvable obstacle. The ONLY thing that can mark a path not-yet-done.
export type ObstacleStatus = "active" | "disputed" | "unresolved" | "resolved";

export interface ObstacleTrigger {
  id: string;
  kind: string;                          // from a per-skill registry (see below)
  name: string;
  status: ObstacleStatus;
  scope: DecisionScope;                  // the target the obstacle blocks
  contradictedFactId?: string;           // points at a DecisionFact (kind=contradiction)
  evidence?: string;
  rationale?: string;                    // required when status != active|resolved
  regression?: ObstacleRegression;       // proof the target regressed/remains-weak
  originSkill: WorkflowSkill;
  originRef: string;
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}

// The integrity payload: an obstacle must prove a regression or persistent weakness.
export interface ObstacleRegression {
  metric: string;                        // "ambiguity" | "clarity:constraints" | "qualityGate" | ...
  priorValue: number;
  newValue: number;
  direction: "rise" | "fall" | "unchanged-weak";  // what "got worse" means for this metric
}

export type ObstacleKindRegistry = Record<string, { label: string; needsRegression: boolean }>;
```

### Per-skill kind registries (skill plugs in, core stays generic)

```ts
// deep-interview keeps its A/B/C/D exactly:
export const DEEP_INTERVIEW_OBSTACLE_KINDS: ObstacleKindRegistry = {
  A: { label: "direct contradiction",     needsRegression: true },
  B: { label: "internal inconsistency",   needsRegression: true },
  C: { label: "low-quality/evasive",      needsRegression: true },  // stays-weak = unchanged-weak
  D: { label: "scope expansion",          needsRegression: true },  // new scope starts at 0
};

// ultragoal defines its own (see Part 2):
export const ULTRAGOAL_OBSTACLE_KINDS: ObstacleKindRegistry = {
  review_failure:           { label: "architect/executor review found defects", needsRegression: true },
  evidence_missing:         { label: "claimed completion lacks evidence",        needsRegression: false },
  scope_drift:              { label: "implementation diverged from approved plan", needsRegression: true },
  contract_contradiction:   { label: "work contradicts an approved decision",  needsRegression: true },
  human_blocked:            { label: "genuinely human-only blocker",           needsRegression: false },
};
```

## Operations

```ts
export interface DecisionLedger {
  facts: DecisionFact[];
  obstacles: ObstacleTrigger[];
}

// promote: add a stable decision. idempotent by (statement hash + scope).
export function promoteDecision(ledger, input): { ledger, fact }

// dispute: mark a fact disputed + append a contradiction obstacle pointing at it.
//          NEVER deletes the fact. Returns the new obstacle.
export function disputeDecision(ledger, factId, contradictionEvidence, scope, origin): { ledger, obstacle }

// recordObstacle: the integrity-gated insert. Runs validateObstacleTransition first;
//                 throws on violation (see Integrity Wall). kind must be in the registry.
export function recordObstacle(ledger, input, registry, validator): { ledger, obstacle }

// resolve: active/disputed/unresolved -> resolved, with rationale + resolution text.
export function resolveObstacle(ledger, obstacleId, resolution, rationale): { ledger }

// The closure query — the single thing Phase 4a (and ultragoal's gate) calls.
export function unresolvedObstacles(
  ledger, filter?: { scope?: Partial<DecisionScope>; material?: boolean }
): ObstacleTrigger[]
export function disputedFacts(ledger, filter?): DecisionFact[]
```

## The integrity wall (generalized `validateDeepInterviewScoredTransition`)

The current deep-interview validator enforces two invariants on `active` triggers.
Generalized, the invariants are skill-agnostic; the *metric* is the only
skill-specific part, supplied by a validator hook.

```ts
export interface ObstacleTransitionContext {
  prior?: { metricValue(metric: string, scope: DecisionScope): number | undefined };
  next:  { metricValue(metric: string, scope: DecisionScope): number | undefined };
}

export interface ObstacleValidator {
  // Returns violations. The shared core calls this for every active obstacle.
  validateActive(obstacle: ObstacleTrigger, ctx: ObstacleTransitionContext): string[];
}

// Shared, always-applied invariants (from the existing deep-interview code):
export function validateObstacleTransition(
  prior, next, registry, skillValidator: ObstacleValidator,
): { ok: boolean; violations: string[] } {
  const v: string[] = [];
  for (const ob of next.obstacles ?? []) {
    if (!registry[ob.kind]) v.push(`unknown obstacle kind ${ob.kind}`);
    if (ob.status === "disputed" || ob.status === "unresolved") {
      if (!ob.rationale?.trim()) v.push(`${ob.kind} is ${ob.status} but has no rationale`);
      continue;                                  // disputed/unresolved don't need regression proof
    }
    if (ob.status === "resolved") continue;
    // active:
    if (!ob.regression) { v.push(`active ${ob.kind} has no regression proof`); continue; }
    const { metric, priorValue, newValue, direction } = ob.regression;
    // Invariant 1: must prove the metric actually moved the wrong way (or stayed weak).
    const ok = direction === "unchanged-weak"
      ? newValue <= priorValue                   // C-style: did not improve
      : direction === "rise"
        ? newValue > priorValue                   // ambiguity rose
        : newValue < priorValue;                  // clarity/criterion fell
    if (!ok) v.push(`active ${ob.kind} did not prove ${metric} regression (${priorValue} -> ${newValue})`);
    // Invariant 2 (skill-specific, delegated): the target must not also be "improving".
    v.push(...skillValidator.validateActive(ob, { prior, next }));
  }
  return { ok: v.length === 0, violations: v };
}
```

The deep-interview adapter supplies a `skillValidator` that re-implements exactly
today's two checks (ambiguity rose; the trigger's dimension did not improve). That is
the **only** skill-specific code — everything else (storage, lifecycle, append-only
dispute, closure query) is shared. The integrity wall moves from "deep-interview-only"
to "every skill that adopts the ledger gets it for free."

## Storage and session-scoping

Two storage tiers, deliberately separate so migration is non-breaking:

- **Tier 1 — per-skill ledger** (Phase A, drop-in): `decisionLedgerPath(skill, sessionId)`
  -> `.pi/workflows/<skill>/decision-ledger.json` (session-scoped, like all paths via
  `session-layout.ts`). Deep-interview's existing `state.established_facts` + per-round
  `triggers` are *projected* into this ledger on write and *read back* on merge, so
  deep-interview state stays the source of truth and nothing breaks.
- **Tier 2 — cross-skill contract ledger** (Phase B, the ROI prize):
  `.pi/workflows/_shared/contract-ledger.json` (session-scoped). Populated by handoffs:
  `deep_interview_write_spec` writes its facts here with `originSkill: "deep-interview"`;
  ralplan and ultragoal read it and append their own facts/obstacles. This is the durable
  contract that survives the pipeline and owns refinement on user re-entry.

`_shared` needs adding to `WorkflowSkill` handling. `WorkflowSkill` is currently a
closed union (`"deep-interview" | "ralplan" | "team" | "ultragoal"` in `paths.ts`).
Prefer keeping the contract ledger outside the per-skill path scheme: a dedicated
`contractLedgerPath(sessionId)` in `session-layout.ts` that does NOT go through
`assertWorkflowSkill`. This avoids widening the closed union and the mutation-guard's
skill allowlist.

## Deep-interview migration (Phase A, zero behavior change)

1. New `shared/decision-ledger.ts` with the types/ops above.
2. In `deep-interview-state.ts`: `DeepInterviewEstablishedFact` and
   `DeepInterviewTriggerMetadata` become aliases:
   - `DeepInterviewEstablishedFact = DecisionFact`
     (`id/statement/round/component/dimension/evidence/disputed` <->
      `id/statement/originRef/scope.component/scope.dimension/evidence/disputed`)
   - `DeepInterviewTriggerMetadata = ObstacleTrigger`
     (`kind/status/component/dimension/priorDimensionScore/newDimensionScore/
       priorAmbiguity/newAmbiguity/evidence/contradictedFactId/rationale` <->
      `kind/status/scope.*/regression.*/evidence/contradictedFactId/rationale`)
3. `validateDeepInterviewScoredTransition` becomes a thin `skillValidator` passed into
   `validateObstacleTransition`. Its two existing checks are preserved verbatim — the
   generalized invariants are a superset that reduces to the same checks when
   `direction: "rise"` and `metric: "ambiguity"`.
4. Runtime rejection behavior is unchanged. No spec, no scoring, no UX changes.

**Verification point before coding:** confirm `deep-interview-tools.ts` `record_scoring`
path calls `validateDeepInterviewScoredTransition` and surfaces violations to the agent
the same way after the adapter swap (validator read; tool error surface not fully traced).

---

# Part 2 — Ultragoal review blockers -> typed obstacles

## Current model (what's there now)

From `ultragoal-runtime.ts`:

- `recordUltragoalReviewBlockers` marks the active goal `review_blocked`, appends a new
  `pending` goal with `steering: { kind: "review_blocker", blockedGoalId }`, and writes
  a `review_blockers_recorded` ledger event.
- `recordUltragoalBlockerClassification` appends a `blocker_classified` ledger event
  with `classification: "human_blocked" | "resolvable"`.
- The guard (`ultragoal-guard.ts`) reports `active_review_blocked_unrecorded` /
  `active_review_blocked_recorded`, and a `failed`/`blocked` checkpoint requires the
  *immediate latest* `human_blocked` classification ledger event to authorize it.

## Gap analysis (what's weak)

1. **Binary classification, no lifecycle.** A blocker is either `human_blocked` or
   `resolvable`. There's no `active -> disputed -> unresolved -> resolved` trajectory.
   A "resolvable" blocker that was never actually resolved is invisible to the gate —
   only `human_blocked` is specially handled.
2. **The blocker is a *goal*, not an *obstacle*.** It's modeled as a new pending goal
   with steering metadata, so "is there an unresolved blocker on this path?" is a
   graph-walk (`activeRecordedBlocker`, `steering.blockedGoalId`), not a query. The
   deep-interview closure guard's strength is that it's a single
   `unresolvedObstacles(filter)` query.
3. **No durable dispute / append-only decisions.** When a goal is re-blocked after a
   re-plan, the prior blocker goal is superseded but the *decision history* (what was
   tried, what failed, what was contradicted) is scattered across ledger events, not a
   queryable fact ledger. This is exactly the "task contract drift" gap.
4. **No integrity wall.** Nothing validates that a recorded blocker actually points at
   a regressed criterion. An agent can record a blocker without proving which
   quality-gate criterion failed.

## Target model

Map review blockers onto the shared ledger so ultragoal gets deep-interview's guarantees:

| Current | Target |
|---|---|
| `steering: { kind: "review_blocker", blockedGoalId }` goal | `ObstacleTrigger { kind: "review_failure" \| "evidence_missing" \| "scope_drift" \| ..., scope: { goalId }, status }` |
| `blocker_classified: human_blocked \| resolvable` ledger event | `status` transition: `active -> unresolved` (human_blocked) or `active -> disputed/resolved` (resolvable, with rationale) |
| `recordUltragoalReviewBlockers` | `recordObstacle` with `ULTRAGOAL_OBSTACLE_KINDS`, gated by `validateObstacleTransition` with an ultragoal `skillValidator` that checks the named quality-gate criterion actually failed |
| graph-walk `activeRecordedBlocker` | `unresolvedObstacles({ scope: { goalId } })` |
| `human_blocked` authorizes `failed`/`blocked` checkpoint | an obstacle with `status: "unresolved"` and `kind: "human_blocked"` authorizes it — same rule, now a query |

The ultragoal `skillValidator` (the only skill-specific piece):

```ts
export const ultragoalObstacleValidator: ObstacleValidator = {
  validateActive(obstacle, ctx) {
    const v: string[] = [];
    if (obstacle.kind === "review_failure") {
      // must reference a real quality-gate criterion that regressed
      if (!obstacle.scope.criterion) v.push("review_failure obstacle must name a criterion");
      const prior = ctx.prior?.metricValue(`gate:${obstacle.scope.criterion}`, obstacle.scope);
      const next  = ctx.next.metricValue(`gate:${obstacle.scope.criterion}`, obstacle.scope);
      if (typeof prior === "number" && typeof next === "number" && next >= prior)
        v.push(`review_failure on ${obstacle.scope.criterion} but the criterion did not regress`);
    }
    if (obstacle.kind === "human_blocked" && obstacle.regression)
      v.push("human_blocked obstacles must not carry a regression (no metric to regress)");
    return v;
  },
};
```

## What ultragoal gains

- **Typed blockers** instead of a binary flag: `review_failure` vs `evidence_missing` vs
  `scope_drift` vs `contract_contradiction` vs `human_blocked` — each maps to a
  different resolution path (re-work vs gather-evidence vs re-plan vs escalate).
- **Durable dispute:** a goal blocked twice across re-plans leaves an append-only
  obstacle trail; the closure/gate can see "this criterion has failed 3 times" and
  escalate instead of silently re-planning.
- **Closure parity:** `ultragoal_guard`'s "is it really done?" becomes *two* checks
  like deep-interview's — (1) the quality gate passes (~ ambiguity <= threshold),
  (2) `unresolvedObstacles({ scope: { goalId } })` is empty (~ the closure guard).
  Today ultragoal has only the first cleanly; the second is an implicit graph-walk.
- **Cross-skill contract:** when a goal's obstacle is `contract_contradiction` pointing
  at a `DecisionFact` with `originSkill: "deep-interview"`, ultragoal can surface
  "implementation contradicts an approved interview decision" — the contract memory
  spanning the pipeline that doesn't exist today.

## Phased migration (non-breaking)

**Phase B-0 — add, don't replace.** **Implemented.** `shared/decision-ledger.ts`
shipped a durable `ObstacleTrigger` record. `ultragoal-obstacles.ts` (new leaf module)
ships `ULTRAGOAL_OBSTACLE_KINDS`, the `ultragoalObstacleValidator`, a per-skill
session-scoped ledger `.pi/workflows/ultragoal/obstacles.json`, and the pure
integrity-wall gate `assertUltragoalObstacle` (+ `appendUltragoalObstacle`, the
self-contained validate-then-write). `recordUltragoalObstacle` (new, in
`ultragoal-runtime.ts`) is the dual-write: it validates the obstacle via the wall
BEFORE any write (so an invalid obstacle never leaves a legacy review-blocker goal
behind), then performs the unchanged legacy write (`recordUltragoalReviewBlockers`:
mark `review_blocked` + steering blocker goal + `review_blockers_recorded` ledger
event) AND appends the validated obstacle to the obstacle ledger. The guard and
checkpoint path are unchanged and still drive off the legacy model; the obstacle
ledger is read only from Phase B-1 onward. Existing behavior and tests are
unaffected (155/155 across ultragoal + team + shared + deep-interview). New unit
coverage in `test/harness/ultragoal/ultragoal-obstacles.test.ts`.

**Phase B-1 — read from obstacles.** **Implemented.** `ultragoal-guard.ts` now
reads the obstacle ledger (`readUltragoalObstacleLedger`, fail-soft to empty) and
computes `unresolvedUltragoalObstacles({ scope: { goalId } })` alongside
`hasRecordedReviewBlocker` (the graph-walk) inside `reviewBlockedDiagnostic`. The
diagnostic state stays graph-walk-driven (unchanged). A new `assertObstacleAgreement`
checks agreement ONLY when the obstacle ledger has spoken (non-empty): if the
obstacle ledger says blocked but the graph-walk has no recorded blocker, that's a
divergence — in dev/test (`NODE_ENV !== "production"`) it throws (catches B-0
dual-write bugs early); in production it `console.warn`s so the advisory guard never
breaks the run. The legacy path (empty obstacle ledger) skips the check entirely, so
existing behavior is unaffected. Coverage in
`test/harness/ultragoal/ultragoal-obstacles-guard.test.ts` (B-0 dual-write agrees,
legacy path authoritative, divergence throws in dev). This is the verification
phase before B-2 makes obstacles authoritative.

**Phase B-2 — obstacles become authoritative.** Switch the guard and
`recordUltragoalBlockerClassification` to drive off obstacle `status` transitions.
`human_blocked` becomes `status: "unresolved"` + `kind: "human_blocked"`; `resolvable`
becomes `status: "disputed"` (needs rationale) or `resolved`. The `steering` goal
becomes a *view* derived from obstacles (kept for backward compat / HUD), not the source
of truth.

**Phase B-3 — deprecate the dual path.** Once stable, stop writing the `steering`
review-blocker goal and rely on obstacles + the cross-skill contract ledger. Keep the
ledger events for audit (they're append-only anyway).

**Phase B-4 — cross-skill contract (the ROI prize).** Populate the Tier-2
`_shared/contract-ledger.json` from `deep_interview_write_spec` (facts) and from ralplan
approval (facts: approved plan decisions). Ultragoal's `contract_contradiction` obstacle
kind then becomes meaningful — it can dispute a fact by `originSkill`, and the closure
query spans the whole pipeline.

## Verification points before coding

- Trace `ultragoal-guard.ts` fully (diagnostic enum read, not the body) to confirm where
  `review_blocked` is checked and that `unresolvedObstacles` can be slotted in alongside
  without changing diagnostics.
- Confirm `appendLedger` event schema is append-only and won't reject new
  `obstacle_recorded`/`obstacle_resolved` events (appears generic from call sites;
  verify the event union).
- The `WorkflowSkill` union: prefer `contractLedgerPath(sessionId)` outside the union
  (noted above) to avoid widening `assertWorkflowSkill` and the mutation-guard skill
  allowlist.

---

## Summary

- **Shared `decision-ledger.ts`** whose only skill-specific seam is a validator hook;
  deep-interview migrates as a zero-behavior-change adapter (Phase A) — **implemented**:
  `packages/workflows/src/harness/shared/decision-ledger.ts` + refactored
  `validateDeepInterviewScoredTransition`; deep-interview tests green, `tsgo`/biome clean.
- **Ultragoal review blockers** become typed, durable, integrity-gated obstacles via a
  four-phase non-breaking path (Phases B-0..B-3); **Phase B-0 is implemented**
  (additive obstacle ledger + `recordUltragoalObstacle` dual-write + integrity wall,
  gate unchanged). Phase B-1 (read obstacles alongside the graph-walk in the guard)
  is the next step.
- **Ralplan verdicts** become typed, durable obstacles via a four-phase non-breaking path
  (Phases R-0..R-4); the R-0 shared-core extension (registry-aware regression skip) is
  **implemented**, and the **R-1 prerequisite (verdict parsing) is implemented**: a
  pure fail-open `parseRalplanVerdict(role, text)` + `isRalplanVerdict` in
  `packages/workflows/src/harness/ralplan/ralplan-verdicts.ts`, wired into
  `writeRalplanArtifact` so critic/architect artifacts carry a structured `verdict` on
  the durable index row and write result (additive; planner/verdict-less stay `undefined`).
  R-1 (the dual-write `recordRalplanObstacle`) is unblocked.
- **Targeted correctness cut (first behavior change, shipped):** the parsed verdict now
  gates `approveRalplanPlan` directly -- no obstacle ledger needed. Approving a plan
  whose latest critic verdict is REJECT now throws (overridable via
  `overrideCriticVerdict`); ITERATE produces a soft warning; APPROVE / no-critic proceed
  silently (backward compat). `doctorRalplan` surfaces the same signal as a warning
  while a plan is pending. This closes a real gap -- the runtime previously approved
  any pending plan regardless of the critic verdict -- and is the highest-ROI consumer
  of the R-1 prerequisite. It is distinct from the migration R-2 (the obstacle-mirror of
  B-1): this cut uses the verdict directly; the migration R-2 would dual-check obstacles.
- **Cross-skill contract ledger** (Phases B-4 / R-4) is the payoff: one durable decision/obstacle
  ledger spanning deep-interview -> ralplan -> ultragoal — the "versioned task contract"
  identified as Pi's #1 ROI borrow, now built on a proven, integrity-enforced primitive
  rather than net-new.

---

# Part 3 — Ralplan verdicts -> typed obstacles

## Current model (what's there now)

From `ralplan-runtime.ts` / `ralplan-agents.ts`:

- Stages `planner -> architect -> critic -> revision -> (adr) -> final`. Each stage
  persists a markdown **artifact** tracked in an index file by
  `{stage, stage_n, path, sha256}` (`RalplanIndexRow`).
- Critic compact verdict: **APPROVE / ITERATE / REJECT**. Architect compact verdict:
  **CLEAR / WATCH / BLOCK** plus **APPROVE / COMMENT / REQUEST CHANGES** (from the role
  prompts in `ralplan-agents.ts`).
- `approveRalplanPlan` records `{ approved, target, note }` against a `pending_approval`
  path; the run then hands off to ultragoal/team/stop.
- `ralplan_doctor` validates index/artifact consistency and pending-approval evidence.
- `vagueness-gate.ts` is a **pre-execution specificity gate** (word count / concrete
  signals, bypassable with `force:`/`!`) — orthogonal to obstacles; do not conflate.

## Gap analysis (what's weak)

1. **Verdicts are transient artifact text, not durable typed obstacles.** "Was this plan
   rejected before, and for what?" requires re-reading artifacts. A rejected plan's
   rationale lives in critic prose, unqueryable.
2. **No append-only history across revision iterations.** A plan rejected in stage N and
   re-submitted in stage N+1 has no queryable ledger of prior rejections, so the planner
   can silently re-submit a near-identical plan and the gate cannot detect
   "rejected 3x for the same defect."
3. **No integrity wall.** A critic REJECT is not required to cite a concrete, indexed
   defect — it could be a vague "this won't work." Nothing validates the obstacle
   references a real artifact + finding.
4. **No cross-skill contract link.** The plan can diverge from the deep-interview spec
   without a typed `contract_contradiction` obstacle surfacing it before approval.
5. **ITERATE / BLOCK / REJECT are conflated in revision routing.** A typed obstacle
   separates "needs more work" (revision_required) from "fundamentally flawed"
   (plan_rejected) from "blocked on a decision" (architect_block) — each with a distinct
   resolution path.

## Required shared-core extension (Phase R-0) — **implemented**

Ralplan verdicts are **qualitative** — there is no numeric metric like deep-interview's
ambiguity. So ralplan obstacle kinds are `needsRegression: false`, and the shared
`validateObstacles` (as shipped in Phase A) must not demand a regression for them.

Extension (now shipped in `shared/decision-ledger.ts`): `validateObstacles` accepts an
optional `ObstacleKindRegistry` via `options.registry`, and for an active obstacle whose
kind has `needsRegression: false` it **skips the `missing_regression_metrics` /
`no_regression` checks** and runs only the skill validator. For `needsRegression: true`
kinds (and for omitted kinds / a missing registry, which default to `true`) the Phase A
behavior is unchanged. Direct unit coverage in
`test/harness/shared/decision-ledger.test.ts`; deep-interview tests stay green.

```ts
// Extension to shared/decision-ledger.ts (Phase R-0):
export function validateObstacles<TSkillCtx>(
  obstacles: ObstacleInput[],
  skillValidator: ObstacleValidator<TSkillCtx>,
  skillCtx: TSkillCtx,
  options: ObstacleValidationOptions & { registry?: ObstacleKindRegistry },
): ObstacleValidationResult {
  // ...
  // active block becomes:
  const needsRegression = options.registry?.[obstacle.kind]?.needsRegression ?? true;
  if (needsRegression) {
    // existing regression check (Phase A)
  }
  violations.push(...skillValidator.validateActive(obstacle, skillCtx));
}
```

Deep-interview passes its registry (all kinds `needsRegression: true`) and is unaffected;
this is purely additive and the deep-interview test stays green.

## Target model

Map ralplan verdicts onto the shared ledger:

| Current | Target |
|---|---|
| critic **REJECT** | `ObstacleTrigger { kind: "plan_rejected", status: "active", scope: { planRef: <stage artifact path> } }` |
| critic **ITERATE** | `ObstacleTrigger { kind: "revision_required", status: "active" }` |
| architect **BLOCK** | `ObstacleTrigger { kind: "architect_block", status: "active" }` |
| architect **REQUEST CHANGES** | `ObstacleTrigger { kind: "revision_required", status: "active" }` |
| plan diverges from deep-interview spec | `ObstacleTrigger { kind: "contract_contradiction", contradictedFactId: <deep-interview fact id> }` |
| plan drifts from its own prior stage | `ObstacleTrigger { kind: "scope_drift", scope: { planRef } }` |

```ts
export const RALPLAN_OBSTACLE_KINDS: ObstacleKindRegistry = {
  plan_rejected:           { label: "critic rejected the plan",          needsRegression: false },
  revision_required:       { label: "critic/architect requested changes",  needsRegression: false },
  architect_block:         { label: "architect blocked on a decision",     needsRegression: false },
  scope_drift:             { label: "plan diverged from a prior stage",   needsRegression: false },
  contract_contradiction:  { label: "plan contradicts an approved decision", needsRegression: false },
};
```

The ralplan `skillValidator` enforces the integrity wall for qualitative obstacles — an
active obstacle must **cite a concrete, indexed defect**:

```ts
export const ralplanObstacleValidator: ObstacleValidator<RalplanObstacleContext> = {
  validateActive(obstacle, ctx) {
    const v: ObstacleViolation[] = [];
    const ref = obstacle.scope?.planRef;
    if (!ref) { v.push({ code: "missing_artifact_ref", kind: obstacle.kind }); return v; }
    // the cited stage artifact must exist in the ralplan index
    if (!ctx.indexHas(ref)) v.push({ code: "unknown_artifact_ref", kind: obstacle.kind, dimension: ref });
    // the obstacle must carry a quoted finding from that artifact
    if (!obstacle.evidence || !ctx.artifactContains(ref, obstacle.evidence))
      v.push({ code: "uncited_finding", kind: obstacle.kind, dimension: ref });
    return v;
  },
};
```

This is the ralplan analogue of deep-interview's "the trigger's dimension must not
improve" check — here it is "the rejection must point at a real, quotable defect."

## What ralplan gains

- **Durable, queryable rejection history** across revision iterations: the planner cannot
  silently resubmit a near-identical plan; the gate can see "rejected 3x for the same
  defect" and escalate to the strategist (the `deliberate` flag already exists for this).
- **Closure parity:** a plan is "ready to approve" when (1) critic verdict is APPROVE,
  AND (2) `unresolvedObstacles({ scope: { planRef } })` is empty — the same
  math-done-vs-coverage-done split as deep-interview / ultragoal.
- **Typed resolution paths:** ITERATE (revise) vs BLOCK (decide) vs REJECT (re-plan) vs
  `contract_contradiction` (reconcile with spec) route to different next stages instead
  of a single "revision" pass.
- **Cross-skill contract:** `contract_contradiction` disputes a deep-interview
  `DecisionFact` by `originSkill`, surfacing plan/spec divergence *before* approval —
  the contract memory spanning the pipeline.

## Phased migration (non-breaking)

**Phase R-0 — shared-core extension.** Add the registry-aware regression skip to
`shared/decision-ledger.ts`. Re-run deep-interview tests (unchanged). Purely additive.

**Phase R-1 — add, don't replace.** Ship `recordRalplanObstacle` that dual-writes: it
records the existing critic/architect verdict in the stage artifact *and* appends an
`ObstacleTrigger` to a per-skill ralplan obstacle ledger. Approval/doctor flow unchanged.
**Prerequisite (implemented):** `ralplan-verdicts.ts` parses critic (`APPROVE`/`ITERATE`/`REJECT`)
and architect (`CLEAR`/`WATCH`/`BLOCK` + `APPROVE`/`COMMENT`/`REQUEST CHANGES`) verdicts from
artifact text fail-open, and `writeRalplanArtifact` stamps the parsed `verdict` onto the
index row + write result. The verdict is now durable and queryable, so R-1 can map it to an
obstacle kind (`plan_rejected` / `revision_required` / `architect_block`) and dual-write.
**R-1 is implemented:** `packages/workflows/src/harness/ralplan/ralplan-obstacles.ts`
is a leaf module exporting `RALPLAN_OBSTACLE_KINDS` (5 qualitative kinds), the R-1
subset `ralplanObstacleValidator` (known-kind + ref-citing kinds must cite `planRef`),
`ralplanObstacleFromVerdict` (verdict -> kind mapping: REJECT -> plan_rejected,
ITERATE -> revision_required, architect BLOCK -> architect_block, architect
REQUEST_CHANGES -> revision_required; positive/commentary verdicts map to none),
ledger I/O (`readRalplanObstacleLedger`/`writeRalplanObstacle`/`appendRalplanObstacle`,
run-scoped `<run-dir>/obstacles.json`, fail-soft on read), and the closure query
`unresolvedRalplanObstacles`. The dual-write is wired into `writeRalplanArtifact`
and is FAIL-SOFT (warns + swallows on any mapping/validation/IO failure) so the
additive ledger can never change the artifact/index write path; it is skipped on the
dedup path and for planner/revision/final stages. The targeted approval gate (shipped
above) still reads the verdict off the index row; this ledger is scaffolding for
R-2+. 20 module unit tests + 7 dual-write integration tests.

**Phase R-2 — read from obstacles.** `approveRalplanPlan` and `ralplan_doctor` call
`unresolvedObstacles({ scope: { planRef } })` alongside the existing pending-approval
check; assert agreement in dev, log divergence otherwise. Verification phase — run real
runs and confirm the query and the verdict agree on every transition.
**R-2 (ralplan mirror of B-1) is implemented:** `approveRalplanPlan` and
`doctorRalplan` read the per-run obstacle ledger alongside the verdict and assert
agreement. `latestCriticPass(rows)` returns `{ verdict, planRef }` for the latest
critic pass; `criticObstacleAgreement(pass, ledger)` compares the latest verdict to
`unresolvedRalplanObstacles({ scope: { planRef } })` -- scoped to the latest pass's
artifact so stale active obstacles from EARLIER revision passes (R-1 never
resolves) do not read as divergence. `approveRalplanPlan` throws in dev/test and
warns in production on divergence (only when the ledger is non-empty, so the
pre-R-1 / fail-soft empty-ledger case never blocks approval); `doctorRalplan`
surfaces divergence AND the empty-ledger-against-a-blocker-verdict case as
warnings. 8 agreement tests (forged divergence, prod-warn, empty-ledger skip,
clean REJECT+override, revision-loop hold, doctor divergence/empty/clean).

**Phase R-3 — obstacles become authoritative.** Revision routing (ITERATE vs REJECT vs
BLOCK) is driven by obstacle `kind`/`status`; the verdict text in artifacts becomes a
*view* derived from obstacles (kept for the HUD/markdown), not the source of truth.

**Phase R-4 — cross-skill contract (the ROI prize).** `approveRalplanPlan` writes
approved-plan `DecisionFact`s to the Tier-2 `_shared/contract-ledger.json` with
`originSkill: "ralplan"`. The `contract_contradiction` kind becomes meaningful — it can
reference deep-interview facts (upstream) and ultragoal goal decisions (downstream).

## Verification points before coding

- Trace where critic APPROVE/ITERATE/REJECT and architect BLOCK are **parsed** from the
  stage artifact (the role *prompt* instructs the verdict; confirm the runtime parses it
  vs. only persisting prose). Add obstacle recording at that parse point, not in the
  prompt.
- Confirm the index row's `sha256` is the canonical artifact ref; obstacle evidence
  should cite `{stage, stage_n, sha256}` so `indexHas` / `artifactContains` are cheap.
- Vagueness gate (`vagueness-gate.ts`) is a pre-execution specificity gate and stays
  orthogonal — do not route it through the obstacle ledger.
- `approveRalplanPlan` already has `approved: boolean` + `note`; the obstacle ledger
  augments (does not replace) the `note` audit trail.