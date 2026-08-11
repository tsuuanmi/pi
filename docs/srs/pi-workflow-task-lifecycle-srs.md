# Software Requirements Specification: Pi Workflow Task Lifecycle

## Document status

- **Status:** Working requirements baseline
- **Reviewed:** 2026-08-04
- **Scope:** Pi workflow, task-contract, subagent, and bounded tmux execution boundaries
- **Related decisions:**
  - [Harness-owned task contract lifecycle ADR](../adr/general-team-system-framework-adr.md)
  - [Worktree and tmux threat-model ADR](../adr/tmux-worktree-threat-model-adr.md)

This document defines requirements. It is not an implementation plan and does not approve source-code, schema, or package changes.

## 1. Purpose

Pi must preserve an approved user goal as work moves from clarification through planning, execution, verification, and packaging. The lifecycle must be owned by the harness where possible rather than inferred from model output.

This SRS establishes the minimum contract for:

- preserving goals and acceptance criteria across workflow handoffs;
- enforcing approval, lifecycle, and evidence boundaries;
- keeping workflow policy separate from generic task orchestration;
- making bounded subagent execution durable and visible; and
- providing safe, explicit controls for Pi-owned tmux workers.

The requirements complement the package-boundary and runtime notes in [`orchestrator-vs-workflows.md`](../architecture/orchestrator-vs-workflows.md), [`team-workflow-orchestrator-runtime.md`](../architecture/team-workflow-orchestrator-runtime.md), and the [Orchestrator subagent documentation](../../packages/orchestrator/docs/subagents/index.md).

## 2. System context

```text
User goal and acceptance criteria
              |
              v
      Pi workflow harness
  intent, policy, gates, artifacts
              |
       workflow-owned adapter
              |
              v
    Generic task orchestrator
 scheduling, routing, retries,
 dependencies, task checkpoints
              |
              v
       Orchestrator subagent runtime
 lifecycle records, artifacts,
 native or tmux execution
              |
              v
       Evidence and receipts
```

The dependency direction is one-way: workflows may use the generic orchestrator through an adapter; the orchestrator must not depend on Pi workflows. A single-subagent lifecycle belongs to Orchestrator's subagent runtime, not to workflow policy or the generic task scheduler.

## 3. Scope

### 3.1 In scope

- Workflow-owned task contracts and handoffs.
- Explicit approval before approved work enters mutation or execution.
- Bounded worker authority, tool access, dependencies, and evidence requirements.
- Generic task scheduling behind a workflow-owned adapter.
- Durable lifecycle records, terminal artifacts, execution paths, and receipts.
- Pi-owned tmux pane/session metadata and bounded inspect, attach, and kill controls.
- Fail-closed behavior for invalid ownership, unavailable tmux, collisions, and ambiguous cleanup.

### 3.2 Out of scope

- A standalone `.agent` platform or a replacement for Pi workflows.
- A new generic runtime abstraction owned by the orchestrator.
- A complete task-contract schema registry or final public API shape.
- Requiring every conceptual role to become a persistent subagent profile.
- Broad cross-domain playbooks, model-cost routing, or evaluation dashboards.
- Automatic worktree isolation; it remains a separate deferred capability.
- `cross-harness-omx-fallback` or any hidden detached fallback for tmux execution.
- Pause, resume, and heartbeat controls for tmux workers until separately specified.

## 4. Actors and ownership

| Actor or component | Responsibility | Must not own |
| --- | --- | --- |
| User | Supplies goals, approves plans, and resolves surfaced conflicts | Silent policy overrides by the model |
| Pi workflow harness | Intent, role policy, approval gates, workflow state, artifacts, and workflow receipts | Generic scheduler internals |
| Workflow-owned adapter | Maps admitted workflow tasks and results to the generic task contract | Unapproved roles, fallback execution, or hidden task shapes |
| Generic orchestrator | Dependencies, routing, queues, retries, generic checkpoints, and task receipts | Pi workflow gates, artifacts, storage, or package knowledge |
| Orchestrator subagent runtime | Single-subagent lifecycle, isolated Pi sessions, durable records, terminal artifacts, and backend controls | Workflow-specific policy |
| tmux | Runs an explicitly owned pane/session target | Ownership decisions or unowned-resource cleanup |

## 5. Functional requirements

### 5.1 Contract and workflow lifecycle

- **SRS-FR-001 — Goal preservation.** The harness MUST retain the user-approved goal and acceptance criteria across clarification, planning, execution, review, and final packaging. Handoffs MUST NOT silently replace or weaken them.
- **SRS-FR-002 — Explicit approval.** Work that can mutate a repository or execute an approved plan MUST remain behind an explicit approval boundary. A model statement alone MUST NOT count as harness approval.
- **SRS-FR-003 — Harness-owned state.** Lifecycle state, legal transitions, approval status, and final status MUST be managed by runtime/workflow state rather than inferred only from free-form model text.
- **SRS-FR-004 — Evidence-backed completion.** A successful completion claim MUST have substantive evidence, such as a reviewed diff, verification command, receipt, test result, or documented blocker resolution. The final status MUST distinguish complete, partial, blocked, and failed outcomes.
- **SRS-FR-005 — Bounded delegation.** Every delegated task MUST have an explicit scope and, where applicable, an assigned role/profile, allowed tools, dependencies, and evidence requirements. Subagents MUST NOT gain an unconstrained role or authority surface by convention.

### 5.2 Workflow and orchestrator boundary

- **SRS-FR-006 — One-way dependency.** Workflow code MAY call the generic orchestrator through a workflow-owned adapter. The generic orchestrator MUST NOT import or depend on workflow packages, workflow storage, workflow gates, or workflow artifact schemas.
- **SRS-FR-007 — Ownership-preserving mapping.** The adapter MUST map workflow tasks to generic task inputs and map results back without transferring ownership of workflow policy, gates, artifacts, or persistence.
- **SRS-FR-008 — Explicit execution operations.** Fresh and resumed team execution MUST be distinct operations. Fresh execution MUST reject an existing checkpoint; resume MUST require a valid resumable checkpoint. No alternate task shape, mode flag, second execution engine, or fallback path may bypass these checks.
- **SRS-FR-009 — Failure visibility.** Mapping, routing, checkpoint, execution, persistence, and workflow-gate failures MUST be surfaced and recorded. A failed orchestrator run MUST NOT silently retry through another execution engine.

### 5.3 Subagent lifecycle and evidence

- **SRS-FR-010 — Durable lifecycle record.** Persistent subagents MUST have a durable record that identifies the subagent, role, status, execution context, parent/current session, resumability, and terminal result or error.
- **SRS-FR-011 — Terminal artifact.** Terminal output MUST be available as a durable artifact or equivalent inspectable result without requiring the parent to replay the entire subagent conversation.
- **SRS-FR-012 — Current-session visibility.** Parent-session inspection MUST expose bounded status, result/error previews, timing when known, and relevant execution paths. Detached work MUST NOT become an untraceable black box.
- **SRS-FR-013 — Lifecycle boundary.** A single-subagent lifecycle MAY support spawn, await, steer, pause, resume, and cancel according to the shared contract. Backend-specific inspection, attach, and kill controls MUST remain in the Orchestrator subagent runtime.

### 5.4 Tmux safety and live controls

- **SRS-FR-014 — Pi-owned target metadata.** A tmux-backed worker MUST record its owner scope, run identity, storage paths, worker metadata, resource kind, exact pane/session target, and intended commands before exposing live controls.
- **SRS-FR-015 — Bounded inspect.** Inspection MUST return durable record/artifact/worker paths and recorded tmux metadata. It MUST NOT infer ownership from a mutable session name alone.
- **SRS-FR-016 — Explicit attach.** Attach MUST return the recorded target-specific command and MUST NOT attach the parent terminal automatically. Pane and session targets MUST use their corresponding target forms.
- **SRS-FR-017 — Validated cleanup.** Kill/cleanup MUST validate Pi's run identity and worker metadata against the active owner scope before using `kill-pane` or `kill-session`. Missing, malformed, or mismatched metadata MUST fail closed.
- **SRS-FR-018 — No hidden fallback.** Missing tmux, an unsupported tmux version, or an unavailable required command MUST produce a blocked/unavailable result. The runtime MUST NOT substitute a hidden detached process.
- **SRS-FR-019 — Idempotent and bounded cleanup.** Cleanup MAY treat an already-removed owned resource as a successful no-op, but MUST report permission failures and MUST never delete an unowned resource. Cleanup MUST NOT reset, discard, or silently overwrite user work.
- **SRS-FR-020 — Worktree boundary.** Worktree isolation MUST be treated as unavailable until separately implemented and verified against the threat-model ADR. A tmux-backed subagent running in a caller-provided `cwd` MUST NOT be represented as an isolated worktree worker.

## 6. Non-functional requirements

- **SRS-NFR-001 — Fail closed:** Ambiguous identity, ownership, routing, approval, or cleanup data MUST block the risky operation rather than guess.
- **SRS-NFR-002 — Durability:** State needed for recovery and audit MUST be written atomically or through an equivalent durable mechanism, with terminal artifacts retained for inspection.
- **SRS-NFR-003 — Determinism:** Role admission, capability routing, task mapping, target selection, and cleanup decisions MUST be reproducible from recorded inputs and metadata.
- **SRS-NFR-004 — Observability:** User-visible receipts and errors MUST identify the affected task/resource and the next safe action without exposing an implicit fallback.
- **SRS-NFR-005 — Composability:** Existing `deep-interview`, `ralplan`, `team`, `ultragoal`, and Pi-native subagent paths remain the substrate. The requirements MUST be satisfiable by extending those paths rather than creating a parallel workflow platform.
- **SRS-NFR-006 — Scope control:** New schemas, role catalogs, storage layouts, migration rules, and public APIs require a separate decision or approved implementation plan when they exceed this minimum contract.

## 7. Acceptance and verification

An implementation satisfies this SRS only when all applicable requirements are covered by focused tests, receipts, or documented verification. The following references identify the primary verification surfaces; they do not claim that every deferred capability is implemented:

| Requirement area | Primary verification surface |
| --- | --- |
| Workflow lifecycle and approval | `packages/workflows/src/runtime/`, workflow skill tests, and [the task-contract ADR](../adr/general-team-system-framework-adr.md) |
| Workflow/orchestrator ownership | [Orchestrator and Workflows](../architecture/orchestrator-vs-workflows.md) and `packages/workflows/src/runtime/` |
| Fresh/resume and failure behavior | [Team Workflow Orchestrator Runtime](../architecture/team-workflow-orchestrator-runtime.md) and team workflow tests |
| Subagent records and receipts | [Subagent documentation](../../packages/orchestrator/docs/subagents/index.md), `packages/orchestrator/src/subagents/`, and orchestrator subagent tests |
| Tmux identity and live controls | [Worktree and tmux Threat Model ADR](../adr/tmux-worktree-threat-model-adr.md), `packages/orchestrator/src/subagents/`, and subagent tool tests |
| Package ownership | [Package boundaries](../architecture/package-boundaries.md) and boundary checks |

## 8. Deferred decisions

The following require their own review before implementation:

- the concrete task-contract schema and public API;
- promotion rules for role/profile definitions;
- worktree creation, collision, dirty-state, merge, and conflict semantics;
- richer evidence matrices and evaluation/trace storage;
- tmux pause, resume, heartbeat, and recovery controls;
- migration and compatibility policy for persisted records.
