# CLI

Command-line interface for Pi.

## Overview

Pi's CLI parses arguments and launches the appropriate mode (interactive, RPC, or JSON).

## Commands

```bash
pi                    # Start interactive mode
pi --mode rpc         # Start RPC mode over stdin/stdout
pi --mode json        # Start JSON event stream mode
pi --model <model>    # Override the default model
pi --thinking-level <level>  # Set thinking level
```

## See Also

- [Using Pi](../usage.md) - Full usage reference
- [RPC Mode](../api/rpc.md) - RPC protocol
- [JSON Mode](../api/json.md) - JSON event stream