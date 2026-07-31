# Workflows Integration

`@tsuuanmi/pi-workflows/register` exposes the bundled workflow integration for Pi hosts. The registration entry point owns workflow tool registration, workflow lifecycle hook wiring, HUD refresh triggers, and the Deep Interview mutation guard.

Pi's bundled extension is a thin adapter at `packages/pi/src/extensions/builtin-workflows.ts`; it imports `registerWorkflows` and passes the Pi extension API host through unchanged.

## Registration

`registerWorkflows(host)` registers:

- Generic subagent lifecycle tools from `src/subagents/subagent-tools.ts`.
- Deep Interview state tools from `src/skills/deep-interview/deep-interview-tools.ts`.
- Guarded workflow spawn tools from `src/skills/ralplan/ralplan-tools.ts`, `src/skills/team/team-tools.ts`, and `src/skills/ultragoal/ultragoal-tools.ts`.
- HUD refresh hooks for workflow-visible state changes.
- The Deep Interview mutation guard for `edit`, `write`, and `bash` tool calls.

`@tsuuanmi/pi-workflows/tools/workflow-tools` remains the lower-level tool registration helper for custom hosts that need tools without bundled hook integration.

## Model-Visible Tools

Registered tools are documented in [subagents/subagents.md](../subagents/subagents.md).

## Hook Actions

Workflow-owned hook actions live in the workflows package. Pi provides the host extension API and does not import skill-specific workflow internals.

## See Also

- [Workflow control plane](../workflow.md)
- [Subagents and workflow tools](../subagents/subagents.md)
- [State](../state/state.md)
