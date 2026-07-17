# CLI

Command-line interface for Pi.

## Overview

Pi's CLI (`pi`) parses arguments and launches the appropriate mode (interactive, print, JSON, or RPC). Argument parsing is handled by `parseArgs()` in `src/cli/args.ts`.

## Commands

```bash
pi                              # Start interactive mode
pi "prompt"                     # Start with an initial prompt
pi -p "prompt"                  # Print mode: run prompt and exit
pi --mode json                  # Start JSON event stream mode
pi --mode rpc                   # Start RPC mode over stdin/stdout
pi --model <model>              # Override the default model
pi --provider <provider>         # Override the default provider
pi --thinking <level>           # Set thinking level: off|minimal|low|medium|high|xhigh
pi --continue / -c              # Continue last session
pi --resume / -r                # Resume most recent session
pi --name <name> / -n           # Name for the session
pi --session <id>               # Resume specific session by ID
pi --tmux                       # Launch in tmux
pi --list-models [pattern]      # List available models, optionally filtered by pattern
pi --verbose                    # Verbose logging
pi --version / -v               # Print version
pi --help / -h                  # Print help
```

### Print Mode (`-p`)

`-p` (or `--print`) processes a single prompt non-interactively and exits. It accepts the prompt as the next argument:

```bash
pi -p "Fix the failing tests"
echo "Explain this code" | pi -p
```

### Session Management

- `--continue` / `-c` — Continue the most recent session in the current directory
- `--resume` / `-r` — Resume the most recent session (same as continue)
- `--name <name>` — Give the session a name for later identification
- `--session <id>` — Resume a specific session by ID

### Model Selection

- `--provider <provider>` — Override the default provider (e.g., `anthropic`, `openai`)
- `--model <model>` — Override the default model (e.g., `claude-sonnet-4-20250514`, `gpt-4o`)
- `--thinking <level>` — Set thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`
- `--list-models [pattern]` — List available models, optionally filtering by glob pattern (e.g., `claude-*`)

### Run Modes

| Mode | Flag | Description |
|------|------|-------------|
| Interactive | (default) | Full TUI with streaming output, slash commands, and tree navigation |
| Print | `-p` | Non-interactive: process a single prompt and exit |
| JSON | `--mode json` | Non-interactive: structured JSON event stream to stdout |
| RPC | `--mode rpc` | Programmatic: bidirectional JSON-RPC over stdio |
| tmux | `--tmux` | Launch in a tmux session for detachment |

### File Arguments

Arguments prefixed with `@` are treated as file paths and their contents are injected as initial messages:

```bash
pi @requirements.md "Implement this feature"
```

### Extension Flags

Unknown flags that don't match built-in arguments are collected as extension flags and passed to the extension system.

## Subcommands

Pi also supports several subcommands:

| Command | Description |
|---------|-------------|
| `pi mcp list` | List configured MCP servers |
| `pi mcp add <name>` | Add an MCP server |
| `pi mcp remove <name>` | Remove an MCP server |
| `pi mcp test <name>` | Test MCP server connectivity |
| `pi workflow <verb>` | Pi workflow control plane (state/operate/gc/...) |
| `pi workflow state <skill>` | Read/write/clear workflow state for a skill |
| `pi config` | Manage Pi configuration |
| `pi update` | Update Pi to the latest version |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PI_CODING_AGENT_DIR` | Override default agent directory (`~/.pi/agent`) |
| `PI_CODING_AGENT_SESSION_DIR` | Override session storage directory |
| `PI_TIMING` | Enable startup timing instrumentation (`1` to enable) |
| `PI_OFFLINE` | Disable package registry lookups and other network package operations (`1` to disable) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |

## See Also

- [Using Pi](../usage.md) - Full usage reference
- [RPC Mode](../api/rpc.md) - RPC protocol
- [JSON Mode](../api/json.md) - JSON event stream
- [Settings](../core/settings/settings.md) - Configuration reference