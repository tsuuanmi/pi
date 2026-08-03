# Pi Documentation

Pi is a minimal terminal coding harness. It is designed to stay small at the core while being extended through TypeScript extensions, skills, prompt templates, themes, and pi packages.

## Quick start

Install Pi with npm:

```bash
npm install -g --ignore-scripts @tsuuanmi/pi
```

`--ignore-scripts` disables dependency lifecycle scripts during install. Pi does not require install scripts for normal npm installs.

On Linux or macOS, you can also use the installer:

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

To uninstall pi itself, use npm for curl and npm installs:

```bash
npm uninstall -g @tsuuanmi/pi
```

For pnpm, Yarn, or Bun installs, use the matching global remove command: `pnpm remove -g @tsuuanmi/pi`, `yarn global remove @tsuuanmi/pi`, or `bun uninstall -g @tsuuanmi/pi`.

Then run it in a project directory:

```bash
pi
```

Authenticate with `/account add` for subscription providers, or set an API key such as `ANTHROPIC_API_KEY` before starting pi.

For the full first-run flow, see [Quickstart](quickstart.md).

## Start here

- [Quickstart](quickstart.md) - install, authenticate, and run a first session.
- [Using Pi](usage.md) - interactive mode, slash commands, context files, and CLI reference.
- [Settings](settings/settings.md) - global and project settings.
- [Sessions](session/sessions.md) - session management, branching, and tree navigation.
- [Compaction](session/compaction/compaction.md) - context compaction and branch summarization.
- [Security](security.md) - sandbox boundaries and vulnerability reporting.
- [Containerization](containerization.md) - sandbox pi with Docker or OpenShell.

## Models and providers

- [Providers](model/providers.md) - subscription and API-key setup for built-in providers.
- [Custom Models](model/models.md) - add model entries for supported provider APIs.
- [Custom Providers](model/custom-provider.md) - implement custom APIs and OAuth flows.
- [Authentication](auth/auth.md) - OAuth flows, token management, and API key resolution.

## Customization

- [Extensions](extensions/extensions.md) - TypeScript modules for tools, commands, events, and custom UI.
- [Skills](skills/skills.md) - Agent Skills for reusable on-demand capabilities.
- [Prompt templates](prompt-templates.md) - reusable prompts that expand from slash commands.
- [Themes](theme/themes.md) - built-in and custom terminal themes.
- [Pi packages](packages.md) - bundle and share extensions, skills, prompts, and themes.

## Workflows and subagents

- [Subagents](subagents/subagents.md) - Pi-native `SubagentManager` for isolated agent workers.
- [Agent Management Contracts](subagents/agent-management-contracts.md) - Phase-gated contracts for agent management migration.
- [Worktree and tmux Threat Model ADR](subagents/tmux-worktree-threat-model-adr.md) - accepted safety contract for worktree/tmux worker orchestration.

## Skills

- [Deep Interview](https://github.com/tsuuanmi/pi/tree/main/packages/workflows/docs/skills/deep-interview/index.md) - Socratic requirements interview with ambiguity scoring.
- [Ralplan](https://github.com/tsuuanmi/pi/tree/main/packages/workflows/docs/skills/ralplan/index.md) - Consensus planning with Planner, Architect, and Critic.
- [Team](https://github.com/tsuuanmi/pi/tree/main/packages/workflows/docs/skills/team/index.md) - Coordinate parallel implementation workers.
- [Ultragoal](https://github.com/tsuuanmi/pi/tree/main/packages/workflows/docs/skills/ultragoal/index.md) - Goal-tracked autonomous execution.

## Programmatic usage

- [SDK](api/sdk.md) - embed pi in Node.js applications.
- [API: RPC mode](api/rpc.md) - integrate over stdin/stdout JSONL.
- [API: JSON event stream](api/json.md) - print mode with structured events.
- [API usage logging](telemetry/api-usage-logging.md) - sidecar JSONL records for completed LLM invocations.
- [TUI components](ui/tui.md) - build custom terminal UI for extensions.

## Reference

- [Session format](session/session-format.md) - JSONL session file format, entry types, and SessionManager API.
- [Agent Profiles](agents/agent-profiles.md) - Named agent configurations with model and tool overrides.
- [Configuration](config/config.md) - Settings hierarchy and resolution.
- [Events](runtime/events.md) - Agent lifecycle and UI event system.
- [LSP](tools/lsp/lsp.md) - Language Server Protocol integration.
- [Messages](api/messages.md) - Agent message types.
- [Package manager](package-manager/package-manager.md) - Pi package distribution.
- [Resources](resources/resources.md) - Resource loading and diagnostics.
- [Telemetry](telemetry/telemetry.md) - Usage tracking.
- [Tools](tools/tools.md) - Built-in tools and custom tool registration.

## Platform setup

- [Terminal setup](utils/terminal/terminal-setup.md) - Kitty keyboard protocol and terminal configuration.
- [tmux](utils/terminal/tmux.md) - tmux key forwarding setup.
- [Shell aliases](utils/terminal/shell-aliases.md) - bash non-interactive mode and alias expansion.

## Interactive mode

- [Keybindings](modes/interactive/keybindings.md) - default shortcuts and custom keybindings.

## Development

- [Development](development.md) - local setup, project structure, and debugging.
- [CLI](cli/cli.md) - Command-line interface.
- [Bun](cli/bun/bun.md) - Bun runtime support.