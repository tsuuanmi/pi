# Workflows Integration

`src/extension.ts` is the package extension entry point for Pi hosts. It defines the workflow host contract and the default adapter. The package owns workflow tools and workflow policy; Pi supplies the host capabilities and context.

The package manifest declares compiled `dist/` entry points for the extension, skills, agents, and command. Pi copies the self-contained package layout without rewriting those paths, and its extension loader passes the Pi extension API host through unchanged.

## Command and tool registration

The two host-facing surfaces are registered independently:

- The package metadata exposes `dist/commands/workflow.js` through the `pi.commands` entry. Pi's package-command dispatcher loads it for external `pi workflow ...` invocations.
- The default extension registers in-process workflow tools and hooks for an interactive Pi session. It does not register or invoke the CLI command.

Commands and tools may share lower-level workflow runtime and skill functions, but neither adapter calls the other. See [Command and tool boundary](../workflow.md#command-and-tool-boundary) for ownership, context, and return-contract rules.

## Registration

The default extension composes the workflow registrars:

- `registerSubagentRuntime(host)` registers orchestrator-owned subagent lifecycle and control tools, HUD data, and shutdown cleanup.
- `registerWorkflowTools(host)` registers workflow state, policy, and guarded workflow operation tools. Workflow execution uses the orchestrator `SubagentManagerApi` in its context.
- `registerWorkflowHooks(host)` from `@tsuuanmi/pi-workflows/hooks` registers HUD refresh hooks and the Deep Interview mutation guard for `edit`, `write`, and `bash` tool calls.
- The extension registers `readWorkflowHudEntries` through Pi's generic `registerHudProvider` feature. Workflows owns active-state data; Pi owns status-line composition and rendering.

`@tsuuanmi/pi-workflows/tool` remains the lower-level tool registration helper for custom hosts that need tools without workflow hook integration.

Subagent lifecycle and control tools are registered by `@tsuuanmi/pi-orchestrator`. Workflow tools use the same orchestrator-owned manager and receipt types through its public package boundary.

## Model-Visible Tools

Registered tools are documented in [subagent/subagent.md](../subagent/subagent.md).

## Hook Actions

Workflow hook actions live in `src/hooks.ts` and use `WorkflowHookHost`. They receive only workflow-relevant session and UI context. The generic agent hook mechanism lives in `@tsuuanmi/pi-agent`; workflow hooks do not move that host context into the agent package.

The package extension passes the host context to workflow tool and hook registrars and does not implement workflow policy. Generic agent declarations come from `@tsuuanmi/pi-agent`; session-aware subagent declarations and execution come from `@tsuuanmi/pi-orchestrator`.

## See Also

- [Workflow control plane](../workflow.md)
- [Subagent and workflow tools](../subagent/subagent.md)
- [State](../state/state.md)
