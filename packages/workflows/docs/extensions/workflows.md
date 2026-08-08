# Workflows Integration

`@tsuuanmi/pi-workflows/register` exposes the bundled workflow integration for Pi hosts. The package owns workflow tools and workflow policy; Pi supplies the host capabilities and context.

Pi's bundled extension is a thin adapter in `packages/pi/src/loader/extensions/loader.ts`; it imports `registerWorkflows` and passes the Pi extension API host through unchanged.

## Command and tool registration

The two host-facing surfaces are registered independently:

- The package metadata exposes `src/commands/workflow.ts` through the `pi.commands` entry. Pi's package-command dispatcher loads it for external `pi workflow ...` invocations.
- `registerWorkflows(host)` registers in-process workflow tools and hooks for an interactive Pi session. It does not register or invoke the CLI command.

Commands and tools may share lower-level workflow runtime and skill functions, but neither adapter calls the other. See [Command and tool boundary](../workflow.md#command-and-tool-boundary) for ownership, context, and return-contract rules.

## Registration

`registerWorkflows(host)` composes two independent registrars:

- `registerWorkflowTools(host)` registers workflow-owned subagent lifecycle tools, Deep Interview state tools, and guarded workflow spawn tools.
- `registerWorkflowHooks(host)` from `@tsuuanmi/pi-workflows/hooks` registers HUD refresh hooks and the Deep Interview mutation guard for `edit`, `write`, and `bash` tool calls.

`@tsuuanmi/pi-workflows/tools/workflow-tools` remains the lower-level tool registration helper for custom hosts that need tools without workflow hook integration.

Pi-native `subagent_inspect`, `subagent_attach`, and `subagent_kill` controls are registered separately by Pi. They use Pi's host context and generic `@tsuuanmi/pi-agent` receipts; they do not depend on workflow tool contracts or workflow final-package assembly.

## Model-Visible Tools

Registered tools are documented in [subagents/subagents.md](../subagents/subagents.md).

## Hook Actions

Workflow hook actions live in `src/hooks.ts` and use `WorkflowHookHost`. They receive only workflow-relevant session and UI context. The generic agent hook mechanism lives in `@tsuuanmi/pi-agent`; workflow hooks do not move that host context into the agent package.

Pi's bundled extension remains an adapter: it passes its host capabilities to `registerWorkflows()` and does not implement workflow policy.

## See Also

- [Workflow control plane](../workflow.md)
- [Subagents and workflow tools](../subagents/subagents.md)
- [State](../state/state.md)
