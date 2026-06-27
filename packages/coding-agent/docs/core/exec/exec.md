# Command Execution

Shell command execution environment and sandbox support.

## Overview

Pi executes commands using the system shell with configurable sandboxing. The execution environment provides:

- Working directory management
- Environment variable inheritance
- Output capture and truncation
- Timeout enforcement
- Abort signal support

## Execution Modes

| Mode | Description |
|------|-------------|
| Default | Commands run in the user's shell environment |
| Containerized | Commands run in a Docker or OpenShell container |

## See Also

- [Security](../trust/security.md) - Trust boundaries and sandboxing
- [Containerization](../../containerization.md) - Docker and OpenShell setup