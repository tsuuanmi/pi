# Workflows Extension

The package extension entry point lives at `src/extensions/workflows.ts` and is the package default export.

## Registration

On load, the extension:

- Registers generic subagent lifecycle tools from `src/subagents/subagent-tools.ts`.
- Registers guarded workflow spawn tools from `src/skills/ralplan/ralplan-tools.ts`, `src/skills/team/team-tools.ts`, and `src/skills/ultragoal/ultragoal-tools.ts`.
- Imports skill transition tables for Deep Interview, Ralplan, Team, and Ultragoal.
- Hooks session/turn/tool lifecycle events to refresh workflow/MCP UI state.
- Blocks unsafe `edit`/`write` calls when the Deep Interview mutation guard says an unfinished interview is active.

## Model-Visible Tools

Registered tools are documented in [subagents/subagents.md](../subagents/subagents.md) and [harness/tools/harness-tools.md](../harness/tools/harness-tools.md).

## HUD Hooks

The extension hooks lifecycle events to refresh workflow/MCP UI state through `@tsuuanmi/pi-tui`. Workflow rendering remains session-scoped: the interactive status line reads session-scoped active state directly.

## See Also

- [Workflow control plane](../workflow.md)
- [Shared utilities](../harness/shared/shared.md)
