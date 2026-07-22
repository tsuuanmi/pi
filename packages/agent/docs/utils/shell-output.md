# Shell Output Capture

`src/utils/shell-output.ts` executes shell commands through an `ExecutionEnv` while capturing combined stdout/stderr for display and context.

## `ShellCaptureOptions`

```typescript
interface ShellCaptureOptions extends Omit<ExecutionEnvExecOptions, "onStdout" | "onStderr"> {
  onChunk?: (chunk: string) => void;
}
```

The options from `ExecutionEnvExecOptions` (`cwd`, `env`, `timeout`, `abortSignal`) are forwarded to `env.exec()`. `onChunk` receives sanitized combined output chunks.

## `ShellCaptureResult`

```typescript
interface ShellCaptureResult {
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}
```

- `output` is the retained display output.
- `exitCode` is undefined when cancelled.
- `cancelled` is true when execution is aborted.
- `truncated` follows the default truncation limits from `truncateTail()`.
- `fullOutputPath` points to a temporary log file when full output exceeded the display limit and was persisted.

## Helpers

```typescript
sanitizeBinaryOutput(str: string): string;

executeShellWithCapture(
  env: ExecutionEnv,
  command: string,
  options?: ShellCaptureOptions,
): Promise<Result<ShellCaptureResult, ExecutionError>>;
```

`sanitizeBinaryOutput()` removes most control characters while preserving tab, line feed, and carriage return.

`executeShellWithCapture()`:

- Captures stdout and stderr as a single output stream.
- Sanitizes binary/control output and normalizes carriage returns.
- Keeps at most twice the default display byte limit in memory while the process runs.
- Writes full output to an `env.createTempFile({ prefix: "bash-", suffix: ".log" })` file after the default byte limit is exceeded.
- Uses `truncateTail()` for returned display output so command endings and errors are preserved.
- Converts aborts into a successful `ShellCaptureResult` with `cancelled: true`.
- Returns `ExecutionError` for spawn, timeout, callback, filesystem-capture, and unknown failures.
