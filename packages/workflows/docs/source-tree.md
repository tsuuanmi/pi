# Workflows Source Tree

This document maps the tracked docs to the current `packages/workflows/src/` layout.

## Top-Level Source Layout

| Source path | Purpose | Docs |
|-------------|---------|------|
| `src/index.ts` | Public package barrel. | [README Public API](../README.md#public-api) |
| `src/extension.ts` | Pi package extension adapter and workflow registration composition. | [extensions/workflows.md](extensions/workflows.md) |
| `src/hooks.ts` | Workflow hook registration, HUD refresh, and mutation policy guards. | [extensions/workflows.md](extensions/workflows.md) |
| `src/agents/` | Bundled markdown agent profiles. | [agents/agents.md](agents/agents.md) |
| `src/artifacts/` | Durable stage-artifact writing and deterministic final-package assembly. | [artifacts/artifacts.md](artifacts/artifacts.md), [artifacts/final-package.md](artifacts/final-package.md) |
| `src/audit/` | Append-only audit records, decision ledgers, tamper evidence, and mutation journals. | [audit/audit.md](audit/audit.md) |
| `src/commands/` | CLI adapter for the external `pi workflow ...` control plane; it does not invoke model-visible tools. | [commands/workflow.md](commands/workflow.md) |
| `src/policy/`, `src/handoff/` | Immutable skill policies, cross-workflow prompts, gates, expected-next checks, and workflow handoffs. | [orchestration/orchestration.md](orchestration/orchestration.md) |
| `src/registry/` | Workflow phase, action, and tool manifest metadata. | [registry/registry.md](registry/registry.md) |
| `src/runtime/` | Runtime owner, RPC, leases, GC, recovery policy/orchestration, validation, finalization, mutation, storage, and receipt rules. | [runtime/runtime.md](runtime/runtime.md) |
| `src/session/` | Workflow-owned path builders and session resolution. Shared `.pi` roots come from `@tsuuanmi/pi/session/root`. | [session/session.md](session/session.md) |
| `src/skills/` | Bundled skill folders, shared help/surface registries, and skill-owned TypeScript implementation. | [Workflow overview](workflow.md) |
| `src/skills/deep-interview/` | Deep Interview `SKILL.md` plus canonical contracts, envelope parsing, persistence, question/round operations, strict tool schemas, transition validation, closure, spec finalization, policy, HUD, mutation guard, and tools. | [skills/deep-interview/index.md](skills/deep-interview/index.md) |
| `src/skills/ralplan/` | Ralplan `SKILL.md` plus domain types, index storage, artifact writing, approval, diagnostics, role definitions, Pi subagent and Orchestrator integration, policy, gates, checkpoints, tools, and HUD. | [skills/ralplan/index.md](skills/ralplan/index.md) |
| `src/skills/team/` | Team `SKILL.md` plus strict domain validation, persistence, state, tasks, gates, messages, role execution adapters, Orchestrator integration, checkpoint/receipt stores, tools, policy, and HUD. | [skills/team/index.md](skills/team/index.md) |
| `src/skills/ultragoal/` | Ultragoal `SKILL.md` plus plan lifecycle/storage, checkpoints, goal selection, artifacts, obstacles, layered quality gates, receipts, tools, and HUD. | [skills/ultragoal/index.md](skills/ultragoal/index.md) |
| `src/state/` | Active workflow state, state validation/writes, workflow ids, and base state models. | [state/state.md](state/state.md) |
| `src/tool/` | Workflow context, host/spec contracts, model-visible result details, registration, and surface metadata. | [tool/details.md](tool/details.md), [subagent/subagent.md](subagent/subagent.md) |
| `src/tool/register.ts` | Registration aggregator for model-visible workflow tools; it does not invoke CLI commands. | [extensions/workflows.md](extensions/workflows.md) |

## Generated Package Assets

`npm run build` compiles TypeScript to `dist/` and the package-owned `scripts/copy-assets.mjs` copies `SKILL.md`, skill assets/references/scripts, state schemas, and agent profiles into the same self-contained `dist/` tree. Do not edit `dist/` directly.

## Test Layout

Tests live under `test/` and are grouped by capability and major source area. Not every source directory has a dedicated test folder.

| Test path | Covers |
|----------|-------|
| `test/deep-interview/` | Deep Interview runtime workflow. |
| `test/ralplan/` | Ralplan workflow, verdicts, obstacles, orchestration snapshot, approve gate. |
| `test/runtime/` | Runtime owner, RPC, GC, recovery, state. |
| `test/team/` | Team coordination workflow runtime. |
| `test/ultragoal/` | Ultragoal plan lifecycle, checkpoints, obstacles, guard, receipt evidence, and `quality-gate/` validation. |
| `test/session/` | Session layout, session-scoped state propagation. |
| `test/audit/` | Decision ledger, state integrity audit and tamper checks. |
| `test/orchestration/` | Shared subagent stream adapter, expected-next-role E2E, handoff carried obstacles, state-integrity handoff + crash injection, vagueness gate. |
| `test/state/` | Workflow handoff, receipts, session-state. |
| `test/registry/` | Workflow manifest state validation. |
| `test/tools/` | Workflow adapters and receipt behavior for agent-owned lifecycle tools. |
| `test/boundary/` | Command/tool surface and package boundary checks. |
| `test/workflows.test.ts` | Package barrel export and end-to-end workflow command surface. |
