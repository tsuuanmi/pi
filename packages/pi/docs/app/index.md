# Application flow

The `src/app/` layer coordinates startup without owning the lower-level agent, session, loader, or mode implementations. The CLI entry point in `src/main.ts` uses these functions to turn parsed arguments into a configured runtime and then dispatch the selected mode.

## Startup order

1. `bootstrapStartup()` resolves the working directory and agent directory, applies offline and proxy settings, and configures the HTTP dispatcher.
2. `runStartupCommands()` handles worker entry points and package/configuration commands that must run before a session is created.
3. `parseArgs()` parses CLI arguments and `resolveStartupMode()` chooses interactive, print, JSON, or RPC mode.
4. `createStartupSession()` resolves the selected or resumed session. Session selection happens before project-bound resources and models are loaded so the final session working directory controls resolution.
5. `createAppRuntime()` creates settings, resource, model, extension, and agent-session services.
6. Help and model-listing requests are handled without entering an interactive session.
7. `prepareInput()` resolves initial messages and file arguments; `initTheme()` applies the selected theme.
8. `runAppMode()` dispatches to interactive, print/JSON, or RPC mode and restores stdout after print-mode execution.

Diagnostics are reported during startup. Errors stop the process before mode execution; warnings are shown without preventing a session from starting.

## Boundaries

- [CLI](../cli/index.md) owns argument parsing and command-line helpers.
- [Loader](../loader/index.md) owns package paths and resource discovery.
- [Settings](../settings/index.md) owns settings resolution.
- [Runtime](../runtime/agent-session.md) owns the agent-session services used by each mode.
- [Modes](../modes/interactive/keybindings.md) owns mode-specific execution and interaction.

The application layer is orchestration code. New user-facing behavior should normally be implemented in the owning boundary rather than added to `src/app/`.
