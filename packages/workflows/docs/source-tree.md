# Workflows Source Tree

This document maps the tracked docs to the current `packages/workflows/src/` layout.

## Top-Level Source Layout

| Source path | Purpose | Docs |
|-------------|---------|------|
| `src/index.ts` | Public package barrel and default workflow extension export. | [README Public API](../README.md#public-api) |
| `src/agents/` | Bundled markdown agent profiles. | [agents/agents.md](agents/agents.md) |
| `src/commands/` | `pi workflow` command entry points. | [commands/workflow.md](commands/workflow.md) |
| `src/extensions/` | Package extension registration. | [extensions/workflows.md](extensions/workflows.md) |
| `src/harness/` | Workflow harness runtime, shared utilities, subagent tools, and per-skill harnesses. | [harness](harness/) |
| `src/harness/deep-interview/` | Deep Interview runtime, state, transition, HUD, mutation guard. | [harness/deep-interview/deep-interview.md](harness/deep-interview/deep-interview.md) |
| `src/harness/ralplan/` | Ralplan planning runtime, gates, verdicts, tools, HUD, compaction. | [harness/ralplan/ralplan.md](harness/ralplan/ralplan.md) |
| `src/harness/runtime/` | Runtime owner, RPC, leases, GC, mutation, storage, receipts. | [harness/runtime/harness-runtime.md](harness/runtime/harness-runtime.md) |
| `src/harness/shared/` | Shared artifacts, audit, compaction, HUD, orchestration, registry, session, and state utilities. | [harness/shared/shared.md](harness/shared/shared.md) |
| `src/harness/subagents/` | Generic subagent model-visible tool registration. | [harness/subagents/subagents.md](harness/subagents/subagents.md) |
| `src/harness/team/` | Team coordination runtime, tools, transitions, HUD, compact view. | [harness/team/team.md](harness/team/team.md) |
| `src/harness/ultragoal/` | Goal execution runtime, artifacts, quality gates, receipts, tools, HUD. | [harness/ultragoal/ultragoal.md](harness/ultragoal/ultragoal.md) |
| `src/skills/` | Bundled skill instruction files. | [skills](skills/) |

## Generated Package Assets

`npm run build` compiles TypeScript to `dist/` and `npm run copy-assets` copies `src/skills/*/SKILL.md` and `src/agents/*.md` into package assets. Do not edit `dist/` directly.
