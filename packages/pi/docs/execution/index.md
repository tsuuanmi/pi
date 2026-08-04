# Command Execution

Pi separates low-level process execution from Pi-specific Bash adapters and output handling.

## Overview

The shared Node process runner provides:

- Explicit executable or shell execution
- Working directory and environment handling
- Byte-preserving stdout/stderr callbacks
- Timeout and abort handling
- Process-group termination for detached commands
- Structured exit, signal, and termination results

Pi adds Bash backends, output buffering, sanitization, truncation, and session integration.

## `runProgram`

`runProgram` executes an executable with arguments and never invokes a shell.

```typescript
interface ProgramOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  cwd?: string;
}

interface ProgramResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  reason: "completed" | "aborted" | "timeout" | "signal";
}

function runProgram(
  command: string,
  args: string[],
  options?: ProgramOptions,
): Promise<ProgramResult>;
```

A missing executable or output callback failure rejects with `ExecutionError`. A terminated process retains its `null` exit code; it is never reported as successful.

## `runBash`

`runBash` provides streaming Bash execution for interactive sessions and RPC modes. It uses the pluggable `BashOperations` backend and the shared `OutputBuffer`.

```typescript
interface BashRunOptions {
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

interface BashResult {
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}

function runBash(
  command: string,
  cwd: string,
  backend: BashOperations,
  options?: BashRunOptions,
): Promise<BashResult>;
```

Output is buffered as bytes, decoded only after complete process chunks are received, sanitized for display, and truncated according to the shared output policy. Full output is written before the result resolves.

## `BashOperations`

`BashOperations` enables local, remote, or container-backed execution:

```typescript
interface BashOperations {
  exec: (
    command: string,
    cwd: string,
    options: {
      onData: (data: Buffer) => void;
      signal?: AbortSignal;
      timeoutSeconds?: number;
      env?: NodeJS.ProcessEnv;
    },
  ) => Promise<{ exitCode: number | null }>;
}
```

The default implementation is `createLocalBash`. It resolves an explicit executable shell or Bash at `/bin/bash` or on `PATH`; it fails with `shell_unavailable` when Bash cannot be resolved. There is no `sh` fallback.

### Bash tool options

```typescript
interface BashToolOptions {
  operations?: BashOperations;
  commandPrefix?: string;
  shellPath?: string;
  spawnHook?: BashSpawnHook;
}

interface BashSpawnContext {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

type BashSpawnHook = (context: BashSpawnContext) => BashSpawnContext;
```

The `spawnHook` adjusts the command, working directory, or environment before execution.

## Shell resolution

`resolveShell(shellPath?)` accepts an executable override or locates Bash at `/bin/bash` or on `PATH`. It throws when the shell cannot be resolved.

## Networking

HTTP dispatcher configuration is documented in [HTTP Networking](../network/http.md).

## See Also

- [Tools](../tools/index.md) - Built-in tool definitions and operations
- [Security](../app/security.md) - Trust boundaries and sandboxing
- [HTTP Networking](../network/http.md) - HTTP proxy and idle timeout configuration
