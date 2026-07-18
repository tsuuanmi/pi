# Node-only Utilities

These helpers are exported only from `@tsuuanmi/pi-agent/node` via `src/node.ts`.

## Child process helpers

From `src/harness/utils/child-process.ts`:

```typescript
spawnProcess(command: string, args: string[], options: SpawnOptions): ChildProcess;
spawnProcess(command: string, args: string[], options?: SpawnOptionsWithoutStdio): ChildProcess;
spawnProcessSync(command: string, args: string[], options: SpawnSyncOptions): SpawnSyncReturns<Buffer>;
waitForChildProcess(child: ChildProcess): Promise<number | null>;
```

`spawnProcess()` and `spawnProcessSync()` wrap Node's spawn APIs. `waitForChildProcess()` resolves with the close code and waits briefly for inherited stdout/stderr pipes to become idle after process exit so detached descendants do not lose tail output.

## File mutation queue

From `src/harness/utils/file-mutation-queue.ts`:

```typescript
withFileMutationQueue<T>(filePath: string, fn: () => Promise<T>): Promise<T>;
```

Serializes async mutations per file path. The queue entry is removed after the final queued mutation settles.

## JSONL helpers

From `src/harness/utils/jsonl.ts`:

```typescript
serializeJsonLine(value: unknown): string;
attachJsonlLineReader(stream: Readable, onLine: (line: string) => void): () => void;
```

`serializeJsonLine()` appends a newline to JSON. `attachJsonlLineReader()` buffers stream data, calls `onLine()` for complete lines, flushes the final partial line on `end`, and returns a cleanup function.

## Path helpers

From `src/harness/utils/paths.ts`:

```typescript
interface PathInputOptions {
  trim?: boolean;
  expandTilde?: boolean;
  homeDir?: string;
  stripAtPrefix?: boolean;
  normalizeUnicodeSpaces?: boolean;
}

canonicalizePath(path: string): string;
isLocalPath(value: string): boolean;
normalizePath(input: string, options?: PathInputOptions): string;
resolvePath(input: string, baseDir?: string, options?: PathInputOptions): string;
getCwdRelativePath(filePath: string, cwd: string): string | undefined;
formatPathRelativeToCwdOrAbsolute(filePath: string, cwd: string): string;
markPathIgnoredByCloudSync(path: string): void;
```

The helpers can trim input, normalize unicode spaces, strip leading CLI `@` prefixes, expand `~`, convert `file://` URLs, resolve local paths relative to a base directory, produce cwd-relative display paths when possible, and mark paths as ignored by cloud-sync providers where supported.
