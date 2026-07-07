# ADR: Evolve Pi Workflows Toward a Harness-Owned Task Contract Lifecycle

## Status

Accepted for direction; implementation pending future ralplan and explicit approval.

This document records an approved direction for Pi workflow evolution. It does not approve source-code implementation, schema changes, package restructuring, or mutation of workflow internals.

## Context

Pi already has first-party workflow primitives for shaping, planning, executing, coordinating, and proving work:

- `deep-interview` clarifies vague goals before mutation.
- `ralplan` creates consensus plans and stops for explicit approval.
- `ultragoal` executes approved concrete goals with evidence and quality gates.
- `team` coordinates parallel workstreams when parallelism is useful.

The previous version of this document described a broad general-purpose multi-agent/team system with roles, schemas, playbooks, model-routing policies, repository layouts, and roadmap ideas. Those ideas are useful as background, but as a direction for Pi they risk overcommitting to a separate generic agent platform.

The approved direction is narrower: evolve Pi's existing workflow system toward a minimal runtime-owned contract that preserves intent and evidence across handoffs.

## Decision

Pi should evolve its existing workflow primitives toward a **Harness-owned task contract lifecycle**.

The lifecycle should be minimal, extensible, and owned by the Pi harness/runtime rather than left to model discretion. It should provide one coherent contract for preserving the user-approved goal, tracking lifecycle state, bounding delegated work, and requiring evidence before completion claims.

This ADR approves the direction only. Any implementation still requires a future ralplan, explicit execution approval, and focused verification.

## Rationale

A harness-owned lifecycle fits Pi better than a new generic multi-agent runtime because Pi already has the core operating pattern:

```text
Shape → Plan → Act → Prove → Package → Learn
```

For Pi, that loop maps to existing primitives rather than replacing them:

| Concept | Pi substrate |
|---------|--------------|
| Shape | `deep-interview` and prompt/skill clarification paths |
| Plan | `ralplan` planner, architect, critic, and pending-approval gates |
| Act | `ultragoal` or `team`, only after explicit approval |
| Prove | receipts, quality gates, evidence, verification commands, final checks |
| Package | final responses, persisted artifacts, summaries, handoffs |
| Learn | future trace, evaluation, and routing improvements |

The important architectural shift is ownership: lifecycle and evidence boundaries should be enforced by the harness where possible, not merely requested in prompts. Models may draft, reason, and execute within assigned boundaries, but the runtime should own contract state, approval gates, durable receipts, and final completion evidence.

## MVP Direction: Harness-owned task contract lifecycle

The first implementable direction should define one minimal contract with these invariants:

1. **Goal preservation across handoffs**  
   The user-approved goal and acceptance criteria remain attached as work moves from shaping to planning to execution.

2. **Harness-owned lifecycle state and approval gates**  
   Workflow state, approval boundaries, status transitions, and finalization are managed by Pi runtime tools rather than informal model claims.

3. **Bounded subagent and worker authority**  
   Subagents and workers operate through assigned tasks, allowed tools, dependencies, and evidence requirements instead of open-ended delegation.

4. **Evidence-backed completion and final status**  
   Completion requires substantive evidence such as diffs, commands, receipts, review results, or documented verification. Final responses should distinguish complete, partial, blocked, and failed outcomes using evidence rather than assertion.

The MVP should describe these invariants in prose. It should not define a full schema registry, storage model, enum set, or final API surface in this ADR.

## Relationship to Existing Pi Workflows

The lifecycle should evolve current Pi workflows rather than create a parallel system:

- `deep-interview` remains the requirements and ambiguity-reduction path.
- `ralplan` remains the consensus planning and approval gate.
- `ultragoal` remains the goal-tracked execution path for approved concrete work.
- `team` remains the coordination path for useful parallel workstreams.
- Subagents remain bounded execution/review/research helpers, not an unconstrained role zoo.

Selected roles from the earlier framework, such as planner, reviewer, prover, librarian, or strategist, may become explicit subagent profiles only when they add implementation value. The default should be mapping roles to existing workflow phases first, then promoting only useful roles to durable profiles.

## Boundaries and Non-Goals

This decision does not approve:

- immediate source implementation;
- a standalone `.agent` platform;
- a new generic runtime abstraction;
- replacement of Pi's existing workflow skills;
- requiring every conceptual role to become a real subagent;
- a full role/profile catalog;
- a full JSON Schema registry;
- broad cross-domain playbooks as MVP scope;
- concrete lifecycle enum names, status values, storage layouts, or schema fields.

Rejecting a standalone `.agent` platform does not reject, deprecate, or remove Pi's existing `.agent` / `.agents` resource-discovery semantics. Existing package, prompt, skill, extension, and agent-profile mechanisms remain separate concerns.

## Likely Future Touchpoints, Not Approved Edit Targets

A future implementation plan may inspect these areas as likely references:

- `packages/workflows/docs/workflow.md` for current workflow behavior and boundaries;
- `packages/workflows/src/extensions/workflows.ts` for workflow tool registration and extension integration;
- workflow state, handoff, receipt, subagent, team, ralplan, deep-interview, and ultragoal harness areas under `packages/workflows/src/`;
- `packages/coding-agent/README.md` for Pi's extension, skill, prompt, package, and customization philosophy.

These are reference points only. This ADR does not approve edits to those files or modules.

## Consequences

### Positive

- Keeps Pi's current workflow architecture central.
- Converts a broad agent-system proposal into a focused Pi direction decision.
- Makes lifecycle ownership explicit and runtime-oriented.
- Preserves evidence-backed completion as a core invariant.
- Leaves room for future schemas, role profiles, and routing improvements without making them MVP commitments.

### Tradeoffs

- The document no longer serves as a complete generic multi-agent framework.
- Some role, schema, and playbook details are intentionally deferred.
- Future implementation still needs a separate plan to decide concrete state shape, APIs, validation points, and migration steps.

## Deferred Scope

Future decisions may revisit:

- formal task-contract schemas;
- role/profile promotion rules;
- richer evidence matrices;
- model-cost routing policy;
- cross-domain playbooks;
- trace dashboards and evaluation loops;
- storage and migration strategy;
- deeper integration with package or extension mechanisms.

Each of those requires its own plan and approval before implementation.

## Acceptance Criteria for Future Implementation Planning

A future ralplan for implementation should demonstrate that it:

- extends existing Pi workflow primitives instead of replacing them;
- identifies the smallest runtime-owned task contract surface;
- preserves user-approved goals across workflow handoffs;
- enforces approval gates and lifecycle transitions in the harness;
- requires evidence-backed completion before final claims;
- bounds subagent work through assigned tasks, allowed tools, and required evidence;
- avoids broad schema, role, playbook, and generic-runtime scope creep.
