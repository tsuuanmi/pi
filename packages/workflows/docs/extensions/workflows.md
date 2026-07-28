# Workflows Integration

`@tsuuanmi/pi-workflows` exposes model-visible workflow tool registration and host contracts from `src/tools/workflow-tools.ts` and the `@tsuuanmi/pi-workflows/tools/workflow-tools` subpath.

Pi owns the built-in extension entrypoint at `packages/pi/src/extensions/builtin-workflows.ts`. That entrypoint registers workflow tools, wires Pi hook actions, refreshes HUD state, and applies the Deep Interview mutation guard.

## Registration

The workflow tool helper registers:

- Generic subagent lifecycle tools from `src/subagents/subagent-tools.ts`.
- Deep Interview state tools from `src/skills/deep-interview/deep-interview-tools.ts`.
- Guarded workflow spawn tools from `src/skills/ralplan/ralplan-tools.ts`, `src/skills/team/team-tools.ts`, and `src/skills/ultragoal/ultragoal-tools.ts`.

## Model-Visible Tools

Registered tools are documented in [subagents/subagents.md](../subagents/subagents.md).

## Hook Actions

Pi owns lifecycle hooks and hook actions. Workflow rendering remains session-scoped: the interactive status line reads session-scoped active state directly.

## See Also

- [Workflow control plane](../workflow.md)
- [Subagents and workflow tools](../subagents/subagents.md)
- [State](../state/state.md)
