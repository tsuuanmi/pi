# Execution Environment and Node.js Implementation

`src/node/env/types.ts` defines the execution-environment contract used by the agent layer. `src/node/env/nodejs.ts` provides the local Node.js implementation exported from `@tsuuanmi/pi-agent/node`.

## Result helpers

```typescript
type Result<TValue, TError> = { ok: true; value: TValue } | { ok: false; error: TError };

ok(value);
err(error);
getOrThrow(result);
getOrUndefined(result);
toError(error);
```

Expected filesystem and shell failures are returned as `Result` values instead of thrown exceptions.

## Error types

- `FileError` has a stable `code`, optional `path`, and optional cause.
- `ExecutionError` has a stable `code` and optional cause.

File error codes: `aborted`, `not_found`, `permission_denied`, `not_directory`, `is_directory`, `invalid`, `not_supported`, `unknown`.

Execution error codes: `aborted`, `timeout`, `shell_unavailable`, `spawn_error`, `callback_error`, `unknown`.

## Filesystem contract

```typescript
interface FileSystem {
  cwd: string;
  absolutePath(path: string, abortSignal?: AbortSignal): Promise<Result<string, FileError>>;
  joinPath(parts: string[], abortSignal?: AbortSignal): Promise<Result<string, FileError>>;
  readTextFile(path: string, abortSignal?: AbortSignal): Promise<Result<string, FileError>>;
  readTextLines(path: string, options?: { maxLines?: number; abortSignal?: AbortSignal }): Promise<Result<string[], FileError>>;
  readBinaryFile(path: string, abortSignal?: AbortSignal): Promise<Result<Uint8Array, FileError>>;
  writeFile(path: string, content: string | Uint8Array, abortSignal?: AbortSignal): Promise<Result<void, FileError>>;
  appendFile(path: string, content: string | Uint8Array, abortSignal?: AbortSignal): Promise<Result<void, FileError>>;
  fileInfo(path: string, abortSignal?: AbortSignal): Promise<Result<FileInfo, FileError>>;
  listDir(path: string, abortSignal?: AbortSignal): Promise<Result<FileInfo[], FileError>>;
  canonicalPath(path: string, abortSignal?: AbortSignal): Promise<Result<string, FileError>>;
  exists(path: string, abortSignal?: AbortSignal): Promise<Result<boolean, FileError>>;
  createDir(path: string, options?: { recursive?: boolean; abortSignal?: AbortSignal }): Promise<Result<void, FileError>>;
  remove(path: string, options?: { recursive?: boolean; force?: boolean; abortSignal?: AbortSignal }): Promise<Result<void, FileError>>;
  createTempDir(prefix?: string, abortSignal?: AbortSignal): Promise<Result<string, FileError>>;
  createTempFile(options?: { prefix?: string; suffix?: string; abortSignal?: AbortSignal }): Promise<Result<string, FileError>>;
  cleanup(): Promise<void>;
}
```

`FileInfo` contains `name`, addressed `path`, `kind` (`file`, `directory`, or `symlink`), `size`, and `mtimeMs`. File operations return addressed paths and do not follow symlinks unless `canonicalPath()` is used.

## Shell contract

```typescript
interface Shell {
  exec(command: string, options?: ExecutionEnvExecOptions): Promise<Result<{ stdout: string; stderr: string; exitCode: number | null }, ExecutionError>>;
  cleanup(): Promise<void>;
}

interface ExecutionEnv extends FileSystem, Shell {}
```

`ExecutionEnvExecOptions` supports `cwd`, `env`, `timeout` in seconds, `abortSignal`, `onStdout`, and `onStderr`.

## Process runner

```typescript
import { runProcess } from "@tsuuanmi/pi-agent/node";

const result = await runProcess("node", ["-e", "console.log('ready')"], {
  cwd: process.cwd(),
  timeoutMs: 5000,
  onStdout: (chunk) => process.stdout.write(chunk),
});
```

`runProcess()` preserves byte output, reports `exitCode`, `signal`, and a termination `reason`, and rejects with `ExecutionError` for spawn or callback failures. Shell execution is explicit through the `shell` option; no shell fallback is applied.

## `NodeExecutionEnv`

```typescript
import { NodeExecutionEnv } from "@tsuuanmi/pi-agent/node";

const env = new NodeExecutionEnv({
  cwd: process.cwd(),
  shellPath: "/bin/bash", // optional
  shellEnv: { CI: "1" }, // optional base env overrides
});
```

The Node implementation:

- Resolves relative paths against `cwd`.
- Uses `/bin/bash` or an executable `bash` found on `PATH`; it fails with `shell_unavailable` when Bash is unavailable.
- Runs shell commands through the shared `runProcess()` primitive with process-tree cleanup on timeout/abort.
- Creates parent directories for `writeFile()` and `appendFile()`.
- Returns `Result` failures for expected filesystem/shell errors.
