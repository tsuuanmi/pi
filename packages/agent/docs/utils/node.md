# Node-only Utilities

These helpers are exported only from `@tsuuanmi/pi-agent/node` via `src/node.ts`.

## Child process helpers

From `src/utils/child-process.ts`:

```typescript
spawnProcess(command: string, args: string[], options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe>): ChildProcessByStdio<null, Readable, Readable>;
spawnProcess(command: string, args: string[], options: SpawnOptions): ChildProcess;
spawnProcessSync(command: string, args: string[], options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string>;
waitForChildProcess(child: ChildProcess): Promise<number | null>;
```

`spawnProcess()` and `spawnProcessSync()` wrap Node's spawn APIs. `waitForChildProcess()` resolves with the exit/close code. After the child exits it waits for inherited stdout/stderr pipes to become idle (re-arming a short grace timer on each chunk) so detached descendants that keep writing past `exit` do not have their tail output truncated; it then destroys the streams.

## File mutation queue

From `src/utils/file-mutation-queue.ts`:

```typescript
withFileMutationQueue<T>(filePath: string, fn: () => Promise<T>): Promise<T>;
```

Serializes async mutations per file path. Operations for different files still run in parallel. The queue uses a realpath key when the path exists (falling back to the resolved path for not-yet-created files) and removes the queue entry after the final queued mutation settles.

## JSONL helpers

From `src/utils/jsonl.ts`:

```typescript
serializeJsonLine(value: unknown): string;
attachJsonlLineReader(stream: Readable, onLine: (line: string) => void): () => void;
```

`serializeJsonLine()` appends an LF to JSON. Framing is LF-only; payload strings may contain other Unicode separators (U+2028, U+2029). `attachJsonlLineReader()` intentionally avoids Node `readline` (which splits on additional Unicode separators that are valid inside JSON strings), buffers stream data, calls `onLine()` for complete lines, strips a trailing CR, flushes the final partial line on `end`, and returns a cleanup function.

## Path helpers

From `src/utils/paths.ts`:

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
