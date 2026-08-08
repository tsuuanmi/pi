# Workflows Source Tree

This document maps the tracked docs to the current `packages/workflows/src/` layout.

## Top-Level Source Layout

| Source path | Purpose | Docs |
|-------------|---------|------|
| `src/index.ts` | Public package barrel. | [README Public API](../README.md#public-api) |
| `src/extension.ts` | Pi package extension adapter and workflow registration composition. | [extensions/workflows.md](extensions/workflows.md) |
| `src/hooks.ts` | Workflow hook registration, HUD refresh, and mutation policy guards. | [extensions/workflows.md](extensions/workflows.md) |
| `src/agents/` | Bundled markdown agent profiles. | [agents/agents.md](agents/agents.md) |
| `src/artifacts/` | Durable artifact writing and receipt helpers. | [artifacts/artifacts.md](artifacts/artifacts.md) |
| `src/audit/` | Append-only audit records, decision ledgers, tamper evidence, and mutation journals. | [audit/audit.md](audit/audit.md) |
| `src/commands/` | CLI adapter for the external `pi workflow ...` control plane; it does not invoke model-visible tools. | [commands/workflow.md](commands/workflow.md) |
| `src/compaction/` | Prompt-budgeted compact state projections. | [compaction/compaction.md](compaction/compaction.md) |
| `src/policy/`, `src/handoff/` | Cross-workflow prompts, gates, expected-next checks, and workflow handoffs. | [orchestration/orchestration.md](orchestration/orchestration.md) |
| `src/registry/` | Workflow transition registry and workflow manifest metadata. | [registry/registry.md](registry/registry.md) |
| `src/runtime/` | Runtime owner, RPC, leases, GC, mutation, storage, receipts. | [runtime/runtime.md](runtime/runtime.md) |
| `src/session/` | Session-scoped path builders and session id resolution. | [session/session.md](session/session.md) |
| `src/skills/` | Bundled skill folders, shared help/surface registries, and skill-owned TypeScript implementation. | [Workflow overview](workflow.md) |
| `src/skills/deep-interview/` | Deep Interview `SKILL.md` plus runtime, state, transitions, handoff guards, help/surface metadata, HUD, mutation guard, and tool registration. | [skills/deep-interview/index.md](skills/deep-interview/index.md) |
| `src/skills/ralplan/` | Ralplan `SKILL.md` plus role definitions and request construction, Pi-agent and Orchestrator adapters, checkpoint and agent-record persistence, planning runtime, transitions, guards, gates, obstacles, verdicts, help/surface metadata, tools, HUD, compaction, orchestration snapshots, expected-action selection, and journaled completion transactions. | [skills/ralplan/index.md](skills/ralplan/index.md) |
| `src/skills/team/` | Team `SKILL.md` plus coordination runtime, role/task execution and event adapters, checkpoint/receipt stores, help/surface metadata, tools, transitions, HUD, and compact view. | [skills/team/index.md](skills/team/index.md) |
| `src/skills/ultragoal/` | Ultragoal `SKILL.md` plus goal execution runtime, artifacts, obstacles, quality gates, receipts, help/surface metadata, tools, HUD, and compact view. | [skills/ultragoal/index.md](skills/ultragoal/index.md) |
| `src/state/` | Active workflow state, state validation/writes, workflow ids, and base state models. | [state/state.md](state/state.md) |
| `src/subagents/` | Generic subagent lifecycle tools, manager access, and execution-level validation. | [subagents/subagents.md](subagents/subagents.md) |
| `src/tools.ts` | Model-visible workflow tool definitions, registration helpers, and host contracts; it does not invoke CLI commands. | [extensions/workflows.md](extensions/workflows.md) |

## Generated Package Assets

`npm run build` compiles TypeScript to `dist/` and `npm run copy-assets` overlays `src/skills/*/SKILL.md`, skill assets/references, `src/state/assets/`, and `src/agents/*.md` into package assets without deleting compiled `dist/skills/<skill>/*.js`/`*.d.ts`. Do not edit `dist/` directly.

## Test Layout

Tests live under `test/` and are grouped by capability and major source area. Not every source directory has a dedicated test folder.

| Test path | Covers |
|----------|-------|
| `test/deep-interview/` | Deep Interview runtime workflow. |
| `test/ralplan/` | Ralplan workflow, verdicts, obstacles, orchestration snapshot, approve gate. |
| `test/runtime/` | Runtime owner, RPC, GC, recovery, state. |
| `test/team/` | Team coordination workflow runtime. |
| `test/ultragoal/` | Ultragoal goal runtime, obstacles, guard, quality gate, receipt evidence. |
| `test/session/` | Session layout, session-scoped state propagation. |
| `test/audit/` | Decision ledger, state integrity audit and tamper checks. |
| `test/orchestration/` | Expected-next-role E2E, handoff carried obstacles, state-integrity handoff + crash injection, vagueness gate. |
| `test/state/` | Workflow handoff, receipts, session-state. |
| `test/compaction/` | Compact-state registry. |
| `test/registry/` | Workflow manifest state validation. |
| `test/subagents/` | Generic subagent tool registration and lifecycle behavior. |
| `test/boundary/` | Command/tool surface and package boundary checks. |
| `test/workflows.test.ts` | Package barrel export and end-to-end workflow command surface. |
