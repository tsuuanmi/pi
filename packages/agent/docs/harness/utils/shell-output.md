# Harness Utilities

Shell output capture and text truncation utilities used by the agent harness.

## Shell Output

### `executeShellWithCapture()`

```typescript
async function executeShellWithCapture(
  command: string,
  options?: ShellCaptureOptions,
): Promise<ShellCaptureResult>
```

Executes a shell command and captures both stdout and stderr.

### `ShellCaptureOptions`

```typescript
interface ShellCaptureOptions extends Omit<ExecutionEnvExecOptions, "onStdout" | "onStderr"> {
  maxOutputBytes?: number;
}
```

### `ShellCaptureResult`

```typescript
interface ShellCaptureResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

### `sanitizeBinaryOutput()`

```typescript
function sanitizeBinaryOutput(str: string): string
```

Replaces non-printable characters in shell output with replacement markers.

## Text Truncation

### `truncateHead()`

```typescript
function truncateHead(content: string, options?: TruncationOptions): TruncationResult
```

Truncates content from the beginning, keeping the tail. Useful for showing the most recent output.

### `truncateTail()`

```typescript
function truncateTail(content: string, options?: TruncationOptions): TruncationResult
```

Truncates content from the end, keeping the head. Useful for showing the start of long outputs.

### `truncateLine()`

```typescript
function truncateLine(line: string, maxLength: number): string
```

Truncates a single line to a maximum length.

### `TruncationOptions`

```typescript
interface TruncationOptions {
  maxLines?: number;    // Default: 2000
  maxBytes?: number;     // Default: 50KB
  lineMaxLength?: number;
}
```

### `TruncationResult`

```typescript
interface TruncationResult {
  content: string;
  truncated: boolean;
  originalLines: number;
  originalBytes: number;
  resultLines: number;
  resultBytes: number;
}
```

### Constants

```typescript
const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
const GREP_MAX_LINE_LENGTH = 500;
```

### `formatSize()`

```typescript
function formatSize(bytes: number): string
```

Formats a byte count as a human-readable string (e.g., "1.2KB", "3.4MB").