# Workflows Integration

`src/extension.ts` is the package extension entry point for Pi hosts. It defines the workflow host contract and the default adapter. The package owns workflow tools and workflow policy; Pi supplies the host capabilities and context.

The package manifest declares compiled `dist/` entry points for the extension, skills, agents, and command. Pi copies the self-contained package layout without rewriting those paths, and its extension loader passes the Pi extension API host through unchanged.

## Command and tool registration

The two host-facing surfaces are registered independently:

- The package metadata exposes `dist/commands/workflow.js` through the `pi.commands` entry. Pi's package-command dispatcher loads it for external `pi workflow ...` invocations.
- The default extension registers in-process workflow tools and hooks for an interactive Pi session. It does not register or invoke the CLI command.

Commands and tools may share lower-level workflow runtime and skill functions, but neither adapter calls the other. See [Command and tool boundary](../workflow.md#command-and-tool-boundary) for ownership, context, and return-contract rules.

## Registration

The default extension composes two independent registrars:

- `registerWorkflowTools(host)` registers the agent-owned subagent lifecycle tools through the workflow adapter, Deep Interview state tools, and guarded workflow spawn tools.
- `registerWorkflowHooks(host)` from `@tsuuanmi/pi-workflows/hooks` registers HUD refresh hooks and the Deep Interview mutation guard for `edit`, `write`, and `bash` tool calls.

`@tsuuanmi/pi-workflows/tool` remains the lower-level tool registration helper for custom hosts that need tools without workflow hook integration.

Pi-native `subagent_inspect`, `subagent_attach`, and `subagent_kill` controls are registered separately by Pi. They use Pi's host context and generic `@tsuuanmi/pi-agent` receipts; they do not depend on workflow tool contracts or workflow final-package assembly.

## Model-Visible Tools

Registered tools are documented in [subagents/subagents.md](../subagents/subagents.md).

## Hook Actions

Workflow hook actions live in `src/hooks.ts` and use `WorkflowHookHost`. They receive only workflow-relevant session and UI context. The generic agent hook mechanism lives in `@tsuuanmi/pi-agent`; workflow hooks do not move that host context into the agent package.

The package extension remains an adapter: it passes Pi's host capabilities to the tool and hook registrars and does not implement workflow policy. Workflow tool declarations derive their core contract from `@tsuuanmi/pi-agent`; only workflow execution context remains host-specific, and Pi converts the declarations into registered `Tool` instances.

## See Also

- [Workflow control plane](../workflow.md)
- [Subagents and workflow tools](../subagents/subagents.md)
- [State](../state/state.md)
