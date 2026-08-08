# Pi Documentation

Pi is a minimal terminal coding harness. It stays small at the core and is extended through TypeScript extensions, skills, prompt templates, themes, and Pi packages.

The documentation is organized to mirror the top-level implementation areas in [`packages/pi/src/`](../src/). The directory names below are source boundaries, not separate installation packages.

## Start here

- [Quickstart](app/quickstart.md) - install, authenticate, and run a first session.
- [Using Pi](app/usage.md) - modes, slash commands, context files, and CLI behavior.
- [Settings](settings/index.md) - global and project settings.
- [Sessions](session/sessions.md) - session management, branching, and tree navigation.
- [Compaction](session/compaction/index.md) - context compaction and branch summarization.
- [Security](app/security.md) - sandbox boundaries and vulnerability reporting.
- [Containerization](app/containerization.md) - run Pi in Docker or OpenShell.

## Source-aligned reference

- [Agent profiles](agent/profiles.md) - agent profile loading and system-prompt definitions.
- [`api/`](api/) - public contracts, messages, RPC, JSON output, and SDK usage.
- [`app/`](app/) - startup, settings, session, runtime, and mode orchestration. See [Application flow](app/index.md).
- [`auth/`](auth/) - authentication storage, credentials, and provider guidance.
- [`cli/`](cli/) - argument parsing, package commands, model listing, and terminal launch helpers.
- [`execution/`](execution/) - command and shell execution boundaries.
- [`extensions/`](extensions/) - extension loading, lifecycle hooks, tools, commands, and UI.
- [`loader/`](loader/) - package identity, paths, resource discovery, resource loading, and agent definitions.
- [`modes/`](modes/) - interactive, print, JSON, and RPC modes.
- [`network/`](network/) - HTTP proxy and dispatcher configuration.
- [`output/`](output/) - bounded output buffering, truncation, and sanitization.
- [`package-manager/`](package-manager/) - Pi package installation, updates, and package resources.
- [`resources/`](resources/) - resource types, diagnostics, and source tracking.
- [`runtime/`](runtime/) - agent-session services, model control, lifecycle events, and telemetry.
- [`session/`](session/) - session persistence, layout, navigation, and compaction.
- [`settings/`](settings/) - settings and keybinding management.
- [`subagents/`](subagents/) - native subagent orchestration and tmux workers.
- [`tools/`](tools/) - built-in tools, tool registration, and LSP support.
- [`ui/`](ui/) - interactive UI, rendering, and themes.

## Models and providers

- [Providers](runtime/models/providers.md) - subscription and API-key setup for built-in providers.
- [Custom models](runtime/models/models.md) - add model entries for supported provider APIs.
- [Custom providers](runtime/models/custom-provider.md) - implement custom APIs and OAuth flows.
- [Authentication](auth/index.md) - OAuth flows, token management, and API-key resolution.

## Customization

- [Extensions](extensions/index.md) - TypeScript modules for tools, commands, events, and custom UI.
- [Skills](loader/skills/index.md) - Agent Skills for reusable on-demand capabilities.
- [Prompt templates](loader/prompt-templates.md) - reusable prompts that expand from slash commands.
- [Themes](ui/theme/index.md) - built-in and custom terminal themes.
- [Pi packages](package-manager/packages.md) - bundle and share extensions, skills, prompts, and themes.

## Workflows and subagents

- [Subagents](subagents/index.md) - Pi-native `SubagentManager` for isolated agent workers.
- [Agent management contracts](subagents/agent-management-contracts.md) - phase-gated contracts for agent management migration.

Architecture records for these boundaries live in the repository-level [documentation hub](../../../docs/index.md):

- [Pi Workflow Task Lifecycle SRS](../../../docs/srs/pi-workflow-task-lifecycle-srs.md)
- [Harness-Owned Task Contract ADR](../../../docs/adr/general-team-system-framework-adr.md)
- [Worktree and tmux Threat Model ADR](../../../docs/adr/tmux-worktree-threat-model-adr.md)

## Programmatic usage

- [SDK](api/sdk.md) - embed Pi in Node.js applications.
- [API: RPC mode](api/rpc.md) - integrate over stdin/stdout JSONL.
- [API: JSON event stream](api/json.md) - print mode with structured events.
- [API usage logging](runtime/telemetry/api-usage-logging.md) - sidecar JSONL records for completed LLM invocations.
- [TUI components](ui/tui.md) - build custom terminal UI for extensions.

## Reference

- [Session format](session/session-format.md) - JSONL session file format, entry types, and `SessionManager` API.
- [Configuration](app/configuration.md) - settings hierarchy and value resolution.
- [Events](runtime/events.md) - agent lifecycle and UI event system.
- [Hook architecture](runtime/hooks.md) - package ownership, registration, and lifecycle boundaries.
- [LSP](tools/lsp/index.md) - Language Server Protocol integration.
- [Messages](api/messages.md) - agent message types.
- [Package manager](package-manager/index.md) - Pi package distribution.
- [Resources](resources/index.md) - resource loading and diagnostics.
- [Tools](tools/index.md) - built-in tools and custom tool registration.
- [Command execution](execution/index.md) - shell and command execution boundaries.
- [HTTP networking](network/http.md) - HTTP proxy and idle-timeout configuration.

## Development

- [Application architecture](app/index.md) - startup order and mode dispatch.
- [Development](app/development.md) - local setup, project structure, and contribution guidance.
- [CLI](cli/index.md) - command-line interface.

## Skills

- [Deep Interview](https://github.com/tsuuanmi/pi/tree/main/packages/workflows/docs/skills/deep-interview/index.md)
- [Ralplan](https://github.com/tsuuanmi/pi/tree/main/packages/workflows/docs/skills/ralplan/index.md)
- [Team](https://github.com/tsuuanmi/pi/tree/main/packages/workflows/docs/skills/team/index.md)
- [Ultragoal](https://github.com/tsuuanmi/pi/tree/main/packages/workflows/docs/skills/ultragoal/index.md)
