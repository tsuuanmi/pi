# CLI

Command-line interface for Pi.

## Overview

Pi's CLI (`pi`) parses arguments and launches the appropriate mode (interactive text, single-shot text/JSON, or RPC). Argument parsing is handled by `parseArgs()` in `src/cli/args.ts`.

## Commands

```bash
pi                              # Start interactive mode
pi "prompt"                     # Start with an initial prompt
pi -p "prompt"                  # Print mode: run prompt and exit
pi --mode json "prompt"         # Run a single-shot JSON event stream
pi --mode rpc                   # Start RPC mode over stdin/stdout
pi --model <pattern>            # Override the default model; supports provider/id and :<thinking>
pi --provider <provider>        # Override the default provider
pi --thinking <level>           # Set thinking level: off|minimal|low|medium|high|xhigh
pi --continue / -c              # Continue previous session
pi --resume / -r                # Select a session to resume
pi --name <name> / -n           # Name for the session
pi --session <path|id>          # Resume specific session file or partial session ID
pi --tmux                       # Launch interactive startup inside a new tmux session
pi --list-models [search]       # List available models, optionally filtered by fuzzy search
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

- `--continue` / `-c` — Continue the previous session
- `--resume` / `-r` — Open the session picker and select a session to resume
- `--name <name>` — Give the session a display name
- `--session <path|id>` — Resume a specific session file or partial session ID

### Model Selection

- `--provider <provider>` — Override the default provider (e.g., `anthropic`, `openai`)
- `--model <pattern>` — Override the default model (e.g., `claude-sonnet-4-20250514`, `openai/gpt-4o`, `sonnet:high`)
- `--thinking <level>` — Set thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`
- `--list-models [search]` — List available models, optionally filtering by fuzzy search

### Run Modes

| Mode | Flag | Description |
|------|------|-------------|
| Interactive | (default) | Full TUI with streaming output, slash commands, and tree navigation |
| Print | `-p` | Non-interactive: process a single prompt and exit |
| JSON | `--mode json` | Single-shot: structured JSON event stream to stdout |
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
| `pi install <source> [-l]` | Install a package source and add it to settings |
| `pi remove <source> [-l]` | Remove a package source from settings |
| `pi uninstall <source> [-l]` | Alias for `remove` |
| `pi update [source|self|pi]` | Update pi and installed packages |
| `pi list` | List installed packages from settings |
| `pi config` | Open the package resource configuration TUI |
| `pi workflow <verb>` | Pi workflow control plane (try `pi workflow --help`) |
| `pi <command> --help` | Show package-command help |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PI_AGENT_DIR` | Override default agent directory (`~/.pi/agent`) |
| `PI_SESSION_DIR` | Override session storage directory |
| `PI_TIMING` | Enable startup timing instrumentation (`1` to enable) |
| `PI_PACKAGE_DIR` | Override package directory (for Nix/Guix store paths) |
| `PI_OFFLINE` | Disable package registry lookups and other network package operations (`1`, `true`, or `yes`) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_OAUTH_TOKEN` | Anthropic OAuth token (alternative to API key) |
| `OPENAI_API_KEY` | OpenAI API key |

## See Also

- [Using Pi](../usage.md) - Full usage reference
- [RPC Mode](../api/rpc.md) - RPC protocol
- [JSON Mode](../api/json.md) - JSON event stream
- [Settings](../core/settings/settings.md) - Configuration reference