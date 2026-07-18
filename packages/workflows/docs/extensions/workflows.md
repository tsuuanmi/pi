# Workflows Extension

The package extension entry point lives at `src/extensions/workflows.ts` and is the package default export.

## Registration

On load, the extension:

- Registers generic subagent lifecycle tools from `src/harness/subagents/subagent-tools.ts`.
- Registers guarded workflow spawn tools from `src/harness/ralplan/ralplan-tools.ts`, `src/harness/team/team-tools.ts`, and `src/harness/ultragoal/ultragoal-tools.ts`.
- Imports skill transition tables for Deep Interview, Ralplan, Team, and Ultragoal.
- Hooks session/turn/tool lifecycle events to refresh workflow/MCP UI state.
- Blocks unsafe `edit`/`write` calls when the Deep Interview mutation guard says an unfinished interview is active.

## Model-Visible Tools

Registered tools are documented in [harness/subagents/subagents.md](../harness/subagents/subagents.md) and [harness/tools/harness-tools.md](../harness/tools/harness-tools.md).

## HUD Hooks

`syncWorkflowHudUi` is intentionally a lifecycle no-op for workflow mirroring: the interactive status line reads session-scoped active state directly. `syncMcpHudUi` mirrors MCP connection status into status/widget slots.

## See Also

- [Workflow control plane](../workflow.md)
- [Shared utilities](../harness/shared/shared.md)
