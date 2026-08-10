# Workflows Source Tree

This document maps the tracked docs to the current `packages/workflows/src/` layout.

## Top-Level Source Layout

| Source path | Purpose | Docs |
|-------------|---------|------|
| `src/index.ts` | Public package barrel. | [README Public API](../README.md#public-api) |
| `src/extension.ts` | Pi package extension adapter and workflow registration composition. | [extensions/workflows.md](extensions/workflows.md) |
| `src/hooks.ts` | Workflow hook registration, HUD refresh, and mutation policy guards. | [extensions/workflows.md](extensions/workflows.md) |
| `src/agents/` | Bundled markdown agent profiles. | [agents/agents.md](agents/agents.md) |
| `src/orchestration/` | Shared adapters from injected subagent operations to Agent/AI orchestration contracts. | [orchestration/subagent-stream.md](orchestration/subagent-stream.md) |
| `src/artifacts/` | Durable artifact writing and receipt helpers. | [artifacts/artifacts.md](artifacts/artifacts.md) |
| `src/audit/` | Append-only audit records, decision ledgers, tamper evidence, and mutation journals. | [audit/audit.md](audit/audit.md) |
| `src/commands/` | CLI adapter for the external `pi workflow ...` control plane; it does not invoke model-visible tools. | [commands/workflow.md](commands/workflow.md) |
| `src/policy/`, `src/handoff/` | Immutable skill policies, cross-workflow prompts, gates, expected-next checks, and workflow handoffs. | [orchestration/orchestration.md](orchestration/orchestration.md) |
| `src/registry/` | Workflow phase, action, and tool manifest metadata. | [registry/registry.md](registry/registry.md) |
| `src/runtime/` | Runtime owner, RPC, leases, GC, mutation, storage, receipts. | [runtime/runtime.md](runtime/runtime.md) |
| `src/session/` | Workflow-owned path builders and session resolution. Shared `.pi` roots come from `@tsuuanmi/pi/session/root`. | [session/session.md](session/session.md) |
| `src/skills/` | Bundled skill folders, shared help/surface registries, and skill-owned TypeScript implementation. | [Workflow overview](workflow.md) |
| `src/skills/deep-interview/` | Deep Interview `SKILL.md` plus runtime, state, policy, handoff guards, help/surface metadata, HUD, mutation guard, and tool registration. | [skills/deep-interview/index.md](skills/deep-interview/index.md) |
| `src/skills/ralplan/` | Ralplan `SKILL.md` plus role definitions and request construction, Pi-agent and Orchestrator adapters, checkpoint and agent-record persistence, planning runtime, policy, guards, gates, obstacles, verdicts, help/surface metadata, tools, HUD, orchestration snapshots, expected-action selection, and journaled completion transactions. | [skills/ralplan/index.md](skills/ralplan/index.md) |
| `src/skills/team/` | Team `SKILL.md` plus coordination runtime, role/task execution and event adapters, checkpoint/receipt stores, help/surface metadata, tools, policy, and HUD. | [skills/team/index.md](skills/team/index.md) |
| `src/skills/ultragoal/` | Ultragoal `SKILL.md` plus goal execution runtime, artifacts, obstacles, quality gates, receipts, help/surface metadata, tools, and HUD. | [skills/ultragoal/index.md](skills/ultragoal/index.md) |
| `src/state/` | Active workflow state, state validation/writes, workflow ids, and base state models. | [state/state.md](state/state.md) |
| `src/tool/` | Workflow context, host/spec contracts, agent-tool adapters, registration, and workflow surface metadata. | [subagents/subagents.md](subagents/subagents.md) |
| `src/tool/adapter.ts` | Adapts agent-owned subagent specs to workflow-host tool specs and workflow receipts. | [subagents/subagents.md](subagents/subagents.md) |
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
| `test/ultragoal/` | Ultragoal goal runtime, obstacles, guard, quality gate, receipt evidence. |
| `test/session/` | Session layout, session-scoped state propagation. |
| `test/audit/` | Decision ledger, state integrity audit and tamper checks. |
| `test/orchestration/` | Shared subagent stream adapter, expected-next-role E2E, handoff carried obstacles, state-integrity handoff + crash injection, vagueness gate. |
| `test/state/` | Workflow handoff, receipts, session-state. |
| `test/registry/` | Workflow manifest state validation. |
| `test/tools/` | Workflow adapters and receipt behavior for agent-owned lifecycle tools. |
| `test/boundary/` | Command/tool surface and package boundary checks. |
| `test/workflows.test.ts` | Package barrel export and end-to-end workflow command surface. |
