# `@tsuuanmi/pi-workflows` Architecture and Production-Readiness Review

## Implementation Update — 2026-08-11

The modularization recommended by this review is complete. The five mixed-responsibility runtime files listed in Section 3 were removed, and consumers now import responsibility-owned modules directly:

- shared runtime: recovery policy, recovery orchestration, validation, finalization, and workspace markers;
- Team: types, validation, storage, tasks, gates, messaging, execution, orchestration, events, receipts, and checkpoints;
- Ralplan: types, index storage, artifacts, approval, doctor, orchestration, and completion transactions;
- Ultragoal: plan model/storage/lifecycle, goal selection, checkpoints, obstacle service, and layered quality-gate validation.

No compatibility barrels or aliases remain for the removed modules, and the unrestricted `./runtime/*` package export was removed. Import-boundary tests keep pure recovery policy and Ultragoal quality-gate validation independent from state mutation services. The package now contains approximately 18,940 TypeScript source lines across 160 focused files; the largest source file is 604 lines rather than 965. This update addresses architectural decomposition only; unresolved durability, transactionality, coverage, and release-policy findings below remain applicable until separately closed with evidence.

**Date:** 2026-08-11

**Package:** `packages/workflows` (`@tsuuanmi/pi-workflows` 0.2.3)

**Decision:** **Not production-ready; redesign and hardening required before the next release.**

## 1. Executive summary

The package is not a failed prototype. It builds, loads through Pi's package system, registers its compiled extension/resources, exposes all four skills, and has substantial state, artifact, gate, receipt, and recovery logic. Ralplan in particular is close to the intended model of a durable, role-driven workflow.

However, the package is not yet a clean, dependable workflow platform:

1. **The shipped workflow instructions contradict the current command implementation.** Several `SKILL.md` files and public docs instruct agents to call removed commands, flags, and fields. Normal model-guided execution can therefore fail even though the TypeScript build and selected tests pass.
2. **There is no single enforceable end-to-end lifecycle.** Workflow phases, handoffs, approvals, artifacts, and recovery are implemented independently. A generic handoff accepts almost any caller/callee pair, and there is no canonical typed transition graph or lifecycle identity.
3. **Internal boundaries are highly coupled.** Workflow policy, state, session paths, handoff, registry, runtime, and audit import each other in cycles. The root barrel and `runtime/*` export map expose implementation details as public API.
4. **Durability claims exceed the implementation.** Important JSON, JSONL, journal, state, and artifact writes are direct writes or read-modify-writes. Process-local queues do not protect multiple owner processes. Lease acquisition is not an atomic inter-process lock.
5. **Pi integration works in the first-party build but is not a clean SDK contract.** The extension duplicates Pi host/context types, assumes optional subagent capability is always present, and Team constructs model selectors from `model.api` instead of `model.provider`.
6. **Publishing is not release-safe.** `dist` is the only published implementation, is gitignored, and has no package-local `prepack`/`prepublishOnly` build gate. The packed package is also much broader than necessary.

The recommended direction is a **declarative workflow definition plus a small shared workflow kernel**, integrated through canonical Pi extension and subagent APIs. Each workflow should own a versioned state machine, role map, skill resources, gates, artifacts, and allowed transitions. Cross-workflow handoffs should be prepared, committed, recoverable, and hash-linked to immutable inputs and approvals.

## 2. Review method

Five read-only subagents reviewed the package in parallel:

- architecture and package boundaries;
- Pi ecosystem and SDK/package loading integration;
- end-to-end workflow mental model;
- production reliability and failure behavior;
- packaging, tests, docs, exports, and maintainability.

The synthesis was independently checked against package source, package metadata, Pi documentation, build output, targeted tests, the Pi package loader, and a dry-run npm tarball.

No implementation behavior was changed by this review.

## 3. Current package profile

| Measure | Current value |
|---|---:|
| TypeScript source | approximately 18,578 lines across 119 files |
| Workflow-owned TypeScript | approximately 10,719 lines under `src/skills/` |
| Test TypeScript | approximately 10,683 lines; 54 test files |
| Largest source files | 814-965 lines each across five core runtime files |
| Dry-run tarball | 507 entries, approximately 2.35 MB unpacked |
| Bundled resources | 4 skills, 8 reusable agent profiles, extension, command |

Largest complexity hotspots:

- `src/runtime/operations.ts` — 965 lines;
- `src/skills/team/runtime.ts` — 933 lines;
- `src/skills/ultragoal/runtime.ts` — 832 lines;
- `src/skills/ultragoal/quality-gate.ts` — 827 lines;
- `src/skills/ralplan/runtime.ts` — 814 lines.

## 4. What is already strong

These capabilities should be retained through any redesign:

- Pi currently discovers `pi:workflows` and loads compiled resources from `dist`.
- Package manifest export targets and copied skill/agent assets currently resolve.
- The package depends on public `@tsuuanmi/pi*` entry points rather than `#pi/*` internals; the external package DAG boundary test passes.
- Subagent lifecycle is delegated to Pi's `SubagentManager`; workflow code does not implement a second generic subagent process manager.
- Ralplan has explicit role order, persisted artifacts, checkpoints, agent records, critic verdicts, pending approval, and completion journaling.
- Team has role-task mapping, checkpoints, event/receipt stores, reviewer/prover gates, and Orchestrator integration.
- Ultragoal has goal decomposition, obstacles, evidence-bound receipts, stale/dirty checks, and quality gates.
- Deep Interview has detailed topology, scoring, ambiguity, closure, restatement, spec, mutation guard, and handoff concepts.
- Session paths use Pi session-root utilities and safe path-component checks.
- Runtime lifecycle checks, bounded retry budgets, receipt-family checks, conservative GC behavior, and fail-closed active-state reads are good foundations.
- The test suite is broad and selected build, package, extension, boundary, and workflow tests pass.

## 5. Intended mental model versus current implementation

### 5.1 Intended model

A workflow package built on Pi should make this model obvious:

```text
WorkflowDefinition
  = identity/version
  + one workflow skill
  + required and optional agent roles
  + typed state machine
  + typed actions/tools
  + durable artifact contract
  + gates and acceptance rules
  + allowed predecessor/successor transitions
  + recovery policy
  + Pi integration adapter
```

The normal product lifecycle should be explicit:

```text
deep-interview
  -> spec-ready
ralplan
  -> planning
  -> pending-approval
approval
  -> approved(team | ultragoal)
execution
  -> active
  -> blocked/recovering
  -> verifying
  -> complete | failed | cancelled
```

Standalone entry or skipped stages can remain possible, but should create an explicit durable waiver/admission event rather than bypassing policy silently.

### 5.2 Current capability matrix

| Workflow | Skill | Agents | Durable state/artifacts | Gates | Recovery | Assessment |
|---|---|---|---|---|---|---|
| Deep Interview | Detailed but oversized `SKILL.md` | Current interactive agent plus ad hoc personas; no dedicated interviewer profile | Strong rounds, scoring, topology, spec, audit, handoff data | Closure and restatement | State resume; no handoff reconciliation | Strong requirements workflow, weak declarative role/lifecycle model |
| Ralplan | Clear staged skill | Explorer, planner, architect, critic, expert | Strong artifacts, indexes, role records, snapshots, journals | Role order, artifact health, critic verdict, approval | Role resume and some rollback | Closest to the intended model |
| Team | Concise execution skill | Worker, reviewer, prover through Orchestrator | Tasks, events, mailboxes, role runs, receipts, checkpoints | Reviewer/prover gates | Orchestrator resume; no workspace rollback | Strong execution engine, weak predecessor/approval proof |
| Ultragoal | Concise execution skill | Guarded worker; architect review appears as evidence rather than an enforced independent role | Plan, goals, ledger, blockers, snapshots, receipts | Strong evidence/quality checks | State checkpoint restore | Strong integrity checks, inconsistent agent independence |

## 6. Prioritized findings

Severity meanings:

- **P0:** immediate catastrophic or security-critical failure;
- **P1:** release blocker for production use;
- **P2:** important architectural/operational debt;
- **P3:** maintainability or documentation issue.

No independently confirmed P0 was found. The package has multiple P1 release blockers.

### P1-1 — Shipped skills invoke removed APIs

The model-visible contract is internally inconsistent:

- `src/commands/workflow/state.ts` supports only `read`, `clear`, `active`, and `doctor`.
- `src/skills/deep-interview/SKILL.md`, `src/skills/team/SKILL.md`, and `src/skills/ultragoal/SKILL.md` instruct agents to run `pi workflow state ... write`.
- Ralplan and Deep Interview skill text instructs `clear --force`, but the parser rejects that option.
- Ralplan instructions and `README.md` describe `overrideCriticVerdict`, while the current changelog says it was removed and runtime approval requires an APPROVE verdict.
- Runtime source still emits operation labels such as `pi workflow state write`.

**Impact:** a correctly loaded skill can fail during normal initialization, recovery, or approval. Build and selected tests do not catch the invalid natural-language command contract.

**Required outcome:** generate or validate all skill/docs command examples against one canonical command/action registry. A release test must execute every shipped command example or statically prove it resolves.

### P1-2 — Handoffs are journaled but not recoverable

`src/handoff/handoff.ts` writes callee state, caller state, receipts, and journal status across multiple steps. Crash injection exists, but there is no general reconciler that can complete or roll back an interrupted handoff.

The generic handoff validates that caller and callee differ, but does not centrally enforce an allowed transition graph. Deep Interview separately allows direct Ralplan, Team, or Ultragoal handoff.

**Impact:** an interruption can leave two workflow states in contradictory phases, with operators able to diagnose but not deterministically reconcile the transition.

**Required outcome:** use a typed prepared/committed/reconciled handoff protocol. Recovery must be idempotent and must prove both sides refer to the same immutable envelope.

### P1-3 — Human approval is represented as caller-provided state, not authoritative consent

Ralplan has a meaningful pending-approval phase, but approval is still a command payload. It does not persist a host-verifiable user event, actor/source, exact plan hash, or consent token as the authority for execution admission.

**Impact:** workflow policy says execution requires explicit approval, but the runtime cannot distinguish a genuine user approval from a model/tool call that supplies `approved: true`.

**Required outcome:** Pi should provide an authoritative approval event/receipt. The workflow should bind it to the exact plan hash and target workflow.

### P1-4 — Lease acquisition and mutation serialization are not safe across processes

`src/runtime/lease.ts` performs read-then-write lease acquisition. Mutation queues are process-local. Owner/epoch checks are not used as fencing checks on every state, event, and receipt mutation.

**Impact:** two owner processes can both believe they acquired a session, then race direct writes, lose records, or submit duplicate work.

**Required outcome:** use an atomic inter-process acquisition primitive and a fencing token verified by every mutation. A multi-process race test must prove exactly one active owner.

### P1-5 — Durable writes are not crash-atomic

Important paths use direct writes or full-file read-modify-write:

- `src/state/state-writer.ts`;
- `src/runtime/storage.ts`;
- `src/audit/transaction-journal.ts`;
- `src/skills/ralplan/completion-transaction.ts`.

Runtime mutation also writes events, receipts, and state in sequence without one authoritative commit point.

**Impact:** process termination, ENOSPC, or cross-process races can leave malformed state, acknowledged receipts without committed state, or lost JSONL entries. Documentation currently overstates atomicity.

**Required outcome:** define a crash-consistent store protocol, atomic replace primitive, append strategy, commit point, and restart reconciliation. Verify every write boundary with fault injection.

### P1-6 — Owner/RPC startup and calls can hang or report false readiness

The runtime owner can acquire a lease before RPC and endpoint readiness. Child readiness, endpoint connection, and request/response operations have missing or incomplete deadlines. Detached start returns before proving that the owner is serving requests.

**Impact:** a session may appear started while its owner is dead, blocked, or unreachable; commands can hang indefinitely.

**Required outcome:** add bounded startup/connect/request deadlines, stderr/resource handling, a positive startup handshake, typed timeout errors, rollback, logs, and attach/inspect guidance.

### P1-7 — Deep Interview's shell mutation boundary is regex-based and bypassable

`src/skills/deep-interview/mutation-guard.ts` tries to infer Bash mutations and target paths lexically. Redirects without spaces, variables, nested interpreters, command substitution, and mixed neutral/mutating commands cannot be treated as a reliable filesystem boundary.

**Impact:** the package documents a stronger mutation prohibition than it can enforce.

**Required outcome:** either use a mediated allowlist/sandbox or explicitly downgrade the guard to advisory protection. Do not claim a security boundary based on shell parsing.

### P1-8 — Pi host integration duplicates and weakens the canonical SDK contract

- `src/extension.ts`, `src/tool/host.ts`, and `src/tool/context.ts` define structural subsets of Pi host/context types instead of using the exported Pi extension contract.
- Pi's extension context permits `subagents` to be unavailable in SDK sessions; workflow context makes it mandatory and subagent-dependent tools dereference it without a capability check.
- `src/skills/team/agent-adapter.ts` constructs a subagent model selector as `${model.api}/${model.id}` instead of Pi's documented `provider/model` form.

**Impact:** first-party Pi loading succeeds, while custom SDK hosts or Team model routing can fail at execution.

**Required outcome:** type the extension against `@tsuuanmi/pi/extensions`, capability-check `ctx.subagents`, and use canonical Pi model identifiers.

### P1-9 — Publishing can ship absent or stale implementation

`package.json` publishes only `dist`, while `dist` is gitignored. The package has no `prepack` or `prepublishOnly` script to rebuild and validate the tarball.

Tests also resolve the package name to `dist`, so source changes can be tested against stale output unless callers manually rebuild first.

**Impact:** direct package publishing can omit implementation or ship stale code/assets while local tests remain green.

**Required outcome:** make packed-artifact build and validation mandatory, then smoke-test every public export and Pi resource from the tarball.

### P2-1 — There is no single declarative workflow definition

Workflow identity is split across:

- `package.json` Pi resources;
- `scripts/copy-assets.mjs` hard-coded skill names;
- `src/registry/workflow-runtime-manifest.ts` phases and state operations;
- help and surface registries;
- individual skill tools/runtimes;
- bundled agent profiles;
- policy and handoff modules.

Adding or changing a workflow requires coordinated edits that no single compiler/build check proves complete.

**Required outcome:** one definition per workflow should declare resources, roles, tools, phases, gates, artifacts, transitions, and retention/recovery policy.

### P2-2 — Internal dependency direction is cyclic

Static top-level import mapping shows cycles including:

- `skills <-> state`;
- `skills <-> policy`;
- `skills <-> handoff`;
- `skills <-> registry`;
- `runtime <-> policy`;
- `state <-> audit`;
- `session -> state -> session`.

This makes ownership unclear: shared modules depend back on workflow-specific implementation, and workflow-specific modules depend on shared modules.

**Required outcome:** enforce a one-way dependency rule: domain definitions -> application/kernel ports -> infrastructure/Pi adapters. Shared layers must not import concrete workflow implementations.

### P2-3 — Public API is much broader than the supported product contract

`src/index.ts` has approximately 76 export statements. `package.json` exposes `./runtime/*`, making owner, RPC, storage, lease, GC, mutation, and receipt internals importable public subpaths.

No non-test workspace source currently appears to need most root exports. Tests rely heavily on the root barrel, which makes internal helpers look supported.

**Impact:** refactoring internal persistence or state schemas becomes a semver/API problem.

**Required outcome:** publish only the extension, command integration, stable workflow definition/read APIs, and explicitly supported SDK operations. Keep stores, guards, and runtime machinery private.

### P2-4 — Generic runtime ownership is not clearly separated from workflow policy

The package contains a 3,300-line detached owner/RPC/lease/GC runtime alongside workflow-specific roles, tools, state, and artifacts. The README calls this the harness control plane, but the conceptual boundary between Pi lifecycle infrastructure and workflow policy is not explicit.

**Required outcome:** decide and document ownership:

- Pi owns generic extension/session/subagent/process lifecycle;
- Orchestrator owns generic role scheduling;
- Workflows owns workflow policy, definitions, state machines, artifacts, gates, role mapping, and handoffs;
- any workflow runtime kernel remains small, port-driven, and package-private.

### P2-5 — Agent-role requirements are uneven and not machine-readable

Ralplan clearly uses named role agents. Team maps worker/reviewer/prover. Deep Interview has no dedicated interviewer profile, and Ultragoal's independent architect/review evidence is not enforced through the guarded worker-spawn path.

**Required outcome:** declare required, optional, and repeatable roles in each workflow definition, including independence requirements and the evidence each role must produce.

### P2-6 — Validation and idempotency are inconsistent

- CLI payload validation is largely ad hoc despite shipped JSON schemas.
- Persisted lease/runtime state validation is shallow in places.
- Idempotent JSONL helpers treat an existing key as success without proving the payload is identical.
- Runtime endpoint framing and request sizes lack robust one-request and resource bounds.

**Required outcome:** use shared runtime validators at every read/write/CLI/tool boundary and bind idempotency keys to canonical payload hashes.

### P2-7 — Audit guarantees are ambiguous

Workflow audit writes are intentionally best-effort in some paths. Audit JSONL has no complete hash chain or protected anchor, while docs use terms such as “tamper evidence.” State checksums stored beside state only detect unsophisticated edits.

**Required outcome:** choose one contract:

- diagnostic audit that can degrade, with visible degraded status; or
- security/compliance audit that participates in the commit and fails closed.

### P2-8 — Package assets and metadata are broader and more fragile than necessary

- Asset copying hard-codes four skills and required directories.
- The dry-run tarball contains 507 entries and source maps, approximately 2.35 MB unpacked.
- `#workflows-test/*` is declared in published `imports` but points to excluded test files.
- The tarball contains no package license file even though the manifest declares MIT.
- Core Pi ecosystem packages are normal dependencies rather than an explicitly reviewed host peer contract.

**Required outcome:** derive assets from the canonical definitions, remove unavailable test aliases from published metadata, include license text, decide peer/dependency ownership, and publish only required maps/assets.

### P3-1 — Documentation and changelog are not trustworthy inventories

Public docs mention removed state actions and source modules that no longer exist, including runtime seams/fallback modules. The Unreleased changelog contains contradictory historical additions/removals and package version 0.2.3 is not represented as a clear released section.

**Required outcome:** regenerate command/module/resource inventories where possible and reconcile all docs before implementation restructuring begins.

### P3-2 — Source, docs, and tests do not share an ownership topology

The package has meaningful tests, but source areas such as handoff and policy do not have matching test/docs ownership paths. High-risk runtime race, crash, timeout, handoff reconciliation, shell-bypass, and packed-artifact scenarios are not convincingly covered.

**Required outcome:** mirror workflow and shared-kernel ownership in `src/`, `test/`, and `docs/`, then map every reliability guarantee to a negative test.

## 7. Recommended target architecture

```text
src/
  integration/
    pi/
      extension.ts
      commands.ts
      hud.ts
      context.ts
  kernel/
    definition.ts
    lifecycle.ts
    transition.ts
    handoff.ts
    approval.ts
    artifacts.ts
    receipts.ts
    store-ports.ts
  workflows/
    deep-interview/
      definition.ts
      state.ts
      actions.ts
      gates.ts
      artifacts.ts
      agents.ts
      skill/SKILL.md
    ralplan/
      ...same ownership shape...
    team/
      ...same ownership shape...
    ultragoal/
      ...same ownership shape...
  infrastructure/
    filesystem-store.ts
    atomic-write.ts
    event-log.ts
    lease.ts
    owner.ts
```

The exact folders can follow repository conventions, but dependency direction should be enforced:

```text
workflow definitions/domain
        -> kernel ports and lifecycle contracts
        -> infrastructure and Pi adapters
```

Adapters may depend inward. Kernel and domain modules must not depend on Pi/TUI/process implementation or concrete workflow modules.

### 7.1 Canonical workflow definition

A machine-readable definition should minimally include:

```ts
interface WorkflowDefinition<State, Action, Artifact> {
  id: string;
  version: number;
  skill: SkillResource;
  agents: RoleDefinition[];
  phases: PhaseDefinition<State>[];
  actions: ActionDefinition<Action>[];
  artifacts: ArtifactDefinition<Artifact>[];
  gates: GateDefinition[];
  transitions: TransitionDefinition[];
  admission: AdmissionPolicy;
  recovery: RecoveryPolicy;
  retention: RetentionPolicy;
}
```

The definition should drive:

- Pi resource manifest validation;
- extension tool registration;
- CLI help and action validation;
- skill command references;
- state/transition validation;
- artifact and receipt validation;
- docs tables;
- build asset copying;
- lifecycle and handoff tests.

### 7.2 Canonical lifecycle envelope

Every end-to-end workflow chain should carry:

- `lifecycle_id` and canonical Pi `session_id`;
- workflow `run_id` and definition version;
- predecessor/successor transition IDs;
- immutable input and output artifact references with hashes;
- required agent-run receipts;
- gate decisions and evidence;
- host-verifiable approval bound to an artifact hash;
- prepared/committed/reconciled handoff records;
- terminal report, changes, verification, residual risks, and next handoff.

## 8. Production acceptance gates

The next implementation should not be considered production-ready until all of these are true:

1. Every shipped skill command/example is generated from or verified against the current action registry.
2. Every workflow has one declarative definition with explicit roles, phases, gates, artifacts, and transitions.
3. Cross-workflow transitions use one typed graph and recoverable two-sided protocol.
4. Approval is an authoritative host/user event bound to the exact plan and execution target.
5. One atomic/fenced persistence protocol protects state, events, receipts, journals, and handoffs.
6. A multi-process contention test proves one owner and rejects stale-owner writes.
7. Fault injection proves old-or-new complete state at every durable write boundary.
8. Owner start, RPC, endpoint, and subagent calls have bounded timeouts, readiness, logs, and cleanup.
9. Pi integration uses canonical extension/context/model contracts and capability checks.
10. Public exports are enumerated and persistence/runtime internals are private.
11. `npm pack` always rebuilds, validates, and smoke-tests the packed artifact.
12. Source, tests, and docs share a clear ownership topology.
13. Reliability and audit claims match tested behavior.
14. Package docs and changelog are reconciled before release.

## 9. Suggested planning sequence

This is ordering guidance, not an implementation plan:

1. **Freeze and reconcile contracts:** fix invalid skill/docs commands and define the current supported public API.
2. **Define the target model:** canonical workflow definition, lifecycle envelope, role contract, approval, and transition graph.
3. **Set package boundaries:** Pi adapter versus workflow kernel versus workflow-owned modules versus infrastructure.
4. **Harden persistence/runtime:** atomic writes, fencing, transactions, recovery, timeouts, observability.
5. **Migrate one vertical slice:** Ralplan is the best reference because it already has the strongest roles/artifacts/gates.
6. **Migrate Deep Interview and handoff:** make spec-to-plan transition authoritative and recoverable.
7. **Migrate Team and Ultragoal:** bind execution admission to approved plan hashes and declarative role requirements.
8. **Narrow exports and publishing:** packed-artifact tests, resource derivation, docs generation, semver review.

## 10. Review conclusion

The current package proves that the workflows are valuable and technically substantial. The problem is not lack of features; it is that workflow policy, state, runtime infrastructure, Pi integration, and public API have grown without one canonical model or enforceable boundary.

The redesign should avoid a broad rewrite that preserves every current surface. First define the stable workflow product contract, then move existing proven capabilities behind it. Ralplan's durable role/artifact model, Team's orchestrated gates, Ultragoal's evidence checks, and Deep Interview's closure logic should be retained, but unified under one lifecycle and one Pi-native integration boundary.
