# Command Execution

Shell command execution and streaming Bash executor.

## Overview

Pi executes commands using the system shell with streaming output capture and configurable timeouts. The execution environment provides:

- Working directory management
- Environment variable inheritance and configuration
- Streaming output with chunk callbacks
- Output truncation with overflow files
- Timeout enforcement (in seconds for tools, milliseconds for `execCommand`)
- Abort signal support

## execCommand

`execCommand` provides a simple command execution API for extensions and internal use:

```typescript
interface ExecOptions {
  signal?: AbortSignal;    // AbortSignal to cancel the command
  timeout?: number;        // Timeout in milliseconds
  cwd?: string;            // Working directory
}

interface ExecResult {
  stdout: string;          // Combined stdout output
  stderr: string;          // Combined stderr output
  code: number;            // Process exit code
  killed: boolean;         // Whether the process was killed
}

function execCommand(
  command: string,
  args: string[],
  cwd: string,
  options?: ExecOptions,
): Promise<ExecResult>;
```

Commands are spawned with `shell: false` and separate stdio pipes. On timeout or abort, the process receives `SIGTERM`, followed by `SIGKILL` after 5 seconds if it hasn't terminated.

## BashExecutor

The bash executor provides streaming bash execution for interactive sessions and RPC modes. It uses the pluggable `BashOperations` interface from the execution module.

### BashExecutorOptions

```typescript
interface BashExecutorOptions {
  onChunk?: (chunk: string) => void;  // Streaming output callback
  signal?: AbortSignal;                 // Cancellation signal
}
```

### BashResult

```typescript
interface BashResult {
  output: string;              // Combined stdout + stderr (sanitized, possibly truncated)
  exitCode: number | undefined; // Process exit code (undefined if killed)
  cancelled: boolean;           // Whether cancelled via signal
  truncated: boolean;           // Whether output was truncated
  fullOutputPath?: string;     // Path to temp file with full output
}
```

### executeBashWithOperations

```typescript
function executeBashWithOperations(
  command: string,
  cwd: string,
  operations: BashOperations,
  options?: BashExecutorOptions,
): Promise<BashResult>;
```

Uses the pluggable `BashOperations` interface from the execution module. Output is sanitized (ANSI stripped, binary normalized) before being returned. When output exceeds the truncation threshold, it's truncated in memory and the full output is saved to a temp file referenced by `fullOutputPath`.

## BashOperations

The `BashOperations` interface (defined in the execution module) enables remote execution delegation:

```typescript
interface BashOperations {
  exec: (
    command: string,
    cwd: string,
    options: {
      onData: (data: Buffer) => void;
      signal?: AbortSignal;
      timeout?: number;
      env?: NodeJS.ProcessEnv;
    },
  ) => Promise<{ exitCode: number | null }>;
}
```

The `exec` method streams output via the `onData` callback. The default implementation (`createLocalBashOperations`) spawns a local shell process.

### BashToolOptions

The bash tool accepts additional configuration:

```typescript
interface BashToolOptions {
  operations?: BashOperations;      // Custom operations (default: local shell)
  commandPrefix?: string;          // Prefix prepended to every command
  shellPath?: string;              // Explicit shell path from settings
  spawnHook?: BashSpawnHook;       // Hook to adjust command/cwd/env before execution
}

interface BashSpawnContext {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

type BashSpawnHook = (context: BashSpawnContext) => BashSpawnContext;
```

The `spawnHook` allows adjusting the command, working directory, or environment variables before execution. It receives the base context (command, cwd, shell env) and must return a `BashSpawnContext`.

## Networking

HTTP dispatcher configuration is documented in [HTTP Networking](../network/http.md).

## See Also

- [Tools](../tools/tools.md) - Built-in tool definitions and operations
- [Security](../security.md) - Trust boundaries and sandboxing
- [HTTP Networking](../network/http.md) - HTTP proxy and idle timeout configuration
