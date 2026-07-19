# Workflows Source Tree

This document maps the tracked docs to the current `packages/workflows/src/` layout.

## Top-Level Source Layout

| Source path | Purpose | Docs |
|-------------|---------|------|
| `src/index.ts` | Public package barrel and default workflow extension export. | [README Public API](../README.md#public-api) |
| `src/agents/` | Bundled markdown agent profiles. | [agents/agents.md](agents/agents.md) |
| `src/commands/` | `pi workflow` command wrapper and implementation modules. | [commands/workflow.md](commands/workflow.md) |
| `src/extensions/` | Package extension registration. | [extensions/workflows.md](extensions/workflows.md) |
| `src/harness/` | Shared workflow harness runtime, shared utilities, and generic subagent tools. Skill-owned TypeScript lives under `src/skills/<skill>/`. | [harness](harness/) |
| `src/skills/deep-interview/` | Deep Interview `SKILL.md` plus runtime, state, transition, HUD, mutation guard. | [harness/deep-interview/deep-interview.md](harness/deep-interview/deep-interview.md), [skills/deep-interview/deep-interview.md](skills/deep-interview/deep-interview.md) |
| `src/skills/ralplan/` | Ralplan `SKILL.md` plus planning runtime, gates, verdicts, tools, HUD, compaction. | [harness/ralplan/ralplan.md](harness/ralplan/ralplan.md), [skills/ralplan/ralplan.md](skills/ralplan/ralplan.md) |
| `src/harness/runtime/` | Runtime owner, RPC, leases, GC, mutation, storage, receipts. | [harness/runtime/harness-runtime.md](harness/runtime/harness-runtime.md) |
| `src/harness/shared/` | Shared artifacts, audit, compaction, orchestration, registry, session, and state utilities. Per-skill HUD builders live with their owning skill folders. | [harness/shared/shared.md](harness/shared/shared.md) |
| `src/harness/subagents/` | Generic subagent model-visible tool registration. | [harness/subagents/subagents.md](harness/subagents/subagents.md) |
| `src/skills/team/` | Team `SKILL.md` plus coordination runtime, tools, transitions, HUD, compact view. | [harness/team/team.md](harness/team/team.md), [skills/team/team.md](skills/team/team.md) |
| `src/skills/ultragoal/` | Ultragoal `SKILL.md` plus goal execution runtime, artifacts, quality gates, receipts, tools, HUD. | [harness/ultragoal/ultragoal.md](harness/ultragoal/ultragoal.md), [skills/ultragoal/ultragoal.md](skills/ultragoal/ultragoal.md) |
| `src/skills/` | Bundled skill folders containing `SKILL.md` assets and skill-owned TypeScript implementation. | [skills](skills/) |

## Generated Package Assets

`npm run build` compiles TypeScript to `dist/` and `npm run copy-assets` overlays `src/skills/*/SKILL.md` and `src/agents/*.md` into package assets without deleting compiled `dist/skills/<skill>/*.js`/`*.d.ts`. Do not edit `dist/` directly.
