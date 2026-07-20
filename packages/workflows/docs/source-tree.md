# Workflows Source Tree

This document maps the tracked docs to the current `packages/workflows/src/` layout.

## Top-Level Source Layout

| Source path | Purpose | Docs |
|-------------|---------|------|
| `src/index.ts` | Public package barrel and default workflow extension export. | [README Public API](../README.md#public-api) |
| `src/agents/` | Bundled markdown agent profiles. | [agents/agents.md](agents/agents.md) |
| `src/artifacts/` | Durable artifact writing and receipt helpers. | [artifacts/artifacts.md](artifacts/artifacts.md) |
| `src/audit/` | Append-only audit records, decision ledgers, tamper evidence, and mutation journals. | [audit/audit.md](audit/audit.md) |
| `src/commands/` | `pi workflow` command wrapper and implementation modules. | [commands/workflow.md](commands/workflow.md) |
| `src/compaction/` | Prompt-budgeted compact state projections. | [compaction/compaction.md](compaction/compaction.md) |
| `src/extensions/` | Package extension registration. | [extensions/workflows.md](extensions/workflows.md) |
| `src/orchestration/` | Cross-workflow prompts, handoffs, gates, expected-next checks, and tool helpers. | [orchestration/orchestration.md](orchestration/orchestration.md) |
| `src/registry/` | Built-in skill registry and workflow manifest metadata. | [registry/registry.md](registry/registry.md) |
| `src/runtime/` | Runtime owner, RPC, leases, GC, mutation, storage, receipts. | [runtime/runtime.md](runtime/runtime.md) |
| `src/session/` | Session-scoped path builders and session id resolution. | [session/session.md](session/session.md) |
| `src/skills/` | Bundled skill folders containing `SKILL.md` assets and skill-owned TypeScript implementation. | [skills](skills/) |
| `src/skills/deep-interview/` | Deep Interview `SKILL.md` plus runtime, state, transitions, HUD, mutation guard, and tool registration. | [skills/deep-interview/deep-interview.md](skills/deep-interview/deep-interview.md) |
| `src/skills/ralplan/` | Ralplan `SKILL.md` plus planning runtime, gates, verdicts, tools, HUD, compaction, orchestration snapshot, expected-action selection, and journaled completion transactions. | [skills/ralplan/ralplan.md](skills/ralplan/ralplan.md) |
| `src/skills/team/` | Team `SKILL.md` plus coordination runtime, tools, transitions, HUD, compact view. | [skills/team/team.md](skills/team/team.md) |
| `src/skills/ultragoal/` | Ultragoal `SKILL.md` plus goal execution runtime, artifacts, quality gates, receipts, tools, HUD. | [skills/ultragoal/ultragoal.md](skills/ultragoal/ultragoal.md) |
| `src/state/` | Active workflow state, state validation/writes, workflow ids, and base state models. | [state/state.md](state/state.md) |
| `src/subagents/` | Generic subagent model-visible tool registration. | [subagents/subagents.md](subagents/subagents.md) |

## Generated Package Assets

`npm run build` compiles TypeScript to `dist/` and `npm run copy-assets` overlays `src/skills/*/SKILL.md` and `src/agents/*.md` into package assets without deleting compiled `dist/skills/<skill>/*.js`/`*.d.ts`. Do not edit `dist/` directly.

## Test Layout

Tests live under `test/` and mirror the `src/` top-level layout. Each source directory has a matching `test/<dir>/` folder.

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
| `test/workflows.test.ts` | Package barrel export and end-to-end workflow command surface. |
