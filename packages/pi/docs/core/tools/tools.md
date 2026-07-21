# Built-in Tools

Pi's built-in tool system providing file operations, shell execution, and code search.

## Overview

Pi ships with seven built-in tools that the agent can use to interact with the filesystem, execute commands, and search code. Each tool follows a pluggable operations pattern that allows extensions to delegate execution to remote systems (for example SSH).

Tools are grouped into two categories:

- **Read-write tools** — `read`, `bash`, `edit`, `write`
- **Read-only tools** — `grep`, `find`, `ls`

## Built-in Tools

| Tool | Factory | Description |
|------|---------|-------------|
| `read` | `createReadTool` / `createReadToolDefinition` | Read file contents with optional offset/limit |
| `bash` | `createBashTool` / `createBashToolDefinition` | Execute shell commands |
| `edit` | `createEditTool` / `createEditToolDefinition` | Make surgical edits to files |
| `write` | `createWriteTool` / `createWriteToolDefinition` | Create or overwrite files |
| `grep` | `createGrepTool` / `createGrepToolDefinition` | Search file contents with regex |
| `find` | `createFindTool` / `createFindToolDefinition` | Search for files by name or pattern |
| `ls` | `createLsTool` / `createLsToolDefinition` | List directory contents |

## Tool Parameters

### `read`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Path to the file to read (relative or absolute) |
| `offset` | number | no | Line number to start reading from (1-indexed) |
| `limit` | number | no | Maximum number of lines to read |

### `bash`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | yes | Bash command to execute |
| `timeout` | number | no | Timeout in seconds (optional, no default) |

### `edit`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Path to the file to edit (relative or absolute) |
| `edits` | array | yes | One or more targeted replacements |

Each edit in `edits`:

| Field | Type | Description |
|-------|------|-------------|
| `oldText` | string | Exact text for one targeted replacement. Must be unique in the original file and must not overlap with other edits. |
| `newText` | string | Replacement text for this targeted edit. |

### `write`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Path to the file to write (relative or absolute) |
| `content` | string | yes | Content to write to the file |

### `grep`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | yes | Search pattern (regex or literal string) |
| `path` | string | no | Directory or file to search (default: current directory) |
| `glob` | string | no | Filter files by glob pattern, e.g. `*.ts` or `**/*.spec.ts` |
| `ignoreCase` | boolean | no | Case-insensitive search (default: false) |
| `literal` | boolean | no | Treat pattern as literal string instead of regex (default: false) |
| `context` | number | no | Number of context lines before and after each match (default: 0) |
| `limit` | number | no | Maximum number of matches to return (default: 100) |

### `find`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | yes | Glob pattern to match files, e.g. `*.ts`, `**/*.json`, or `src/**/*.spec.ts` |
| `path` | string | no | Directory to search in (default: current directory) |
| `limit` | number | no | Maximum number of results (default: 1000) |

### `ls`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | no | Directory to list (default: current directory) |
| `limit` | number | no | Maximum number of entries to return (default: 500) |

## Tool Architecture

Each tool is composed of:

1. **Definition** — TypeBox JSON schema for input parameters, created by the `createXToolDefinition` function
2. **Implementation** — Async function that executes the tool, created by the `createXTool` function
3. **Display** — Optional TUI rendering for tool calls and results

### Factory Functions

The tools module provides three factory functions for creating tool sets:

```typescript
// Create all 7 tool definitions (for extension registration)
const definitions = createAllToolDefinitions(cwd, options);

// Create read-write tool instances (read, bash, edit, write)
const readWriteTools = createCodingTools(cwd, options);

// Create read-only tool instances (read, grep, find, ls)
const readOnlyTools = createReadOnlyTools(cwd, options);
```

All factory functions accept optional per-tool configuration:

```typescript
interface ToolsOptions {
  read?: ReadToolOptions;
  bash?: BashToolOptions;
  write?: WriteToolOptions;
  edit?: EditToolOptions;
  grep?: GrepToolOptions;
  find?: FindToolOptions;
  ls?: LsToolOptions;
}
```

### Pluggable Operations

Every built-in tool exposes an `Operations` interface that can be overridden to delegate execution to remote systems (for example, via SSH). This enables extensions to proxy tool operations without replacing the entire tool.

```typescript
// Each tool has its own Operations type
interface ReadOperations {
  readFile: (absolutePath: string) => Promise<Buffer>;
  access: (absolutePath: string) => Promise<void>;
}

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

interface EditOperations {
  readFile: (absolutePath: string) => Promise<Buffer>;
  writeFile: (absolutePath: string, content: string) => Promise<void>;
  access: (absolutePath: string) => Promise<void>;
}

interface WriteOperations {
  writeFile: (absolutePath: string, content: string) => Promise<void>;
  mkdir: (dir: string) => Promise<void>;
}

interface GrepOperations {
  isDirectory: (absolutePath: string) => Promise<boolean> | boolean;
  readFile: (absolutePath: string) => Promise<string> | string;
}

interface FindOperations {
  exists: (absolutePath: string) => Promise<boolean> | boolean;
  glob: (pattern: string, cwd: string, options: { ignore: string[]; limit: number }) => Promise<string[]> | string[];
}

interface LsOperations {
  exists: (absolutePath: string) => Promise<boolean> | boolean;
  stat: (absolutePath: string) => Promise<{ isDirectory: () => boolean }> | { isDirectory: () => boolean };
  readdir: (absolutePath: string) => Promise<string[]> | string[];
}
```

Pass custom operations via each tool's options:

```typescript
const tool = createBashTool(cwd, {
  operations: {
    exec: async (command, cwd, { onData, signal, timeout, env }) => {
      // custom execution logic
      return { exitCode: 0 };
    },
  },
});
```

Default implementations use the local filesystem and system shell. The `createLocalBashOperations` factory creates a `BashOperations` instance that spawns local shell processes:

```typescript
import { createLocalBashOperations } from "@tsuuanmi/pi";

const localOps = createLocalBashOperations({ shellPath: "/bin/bash" });
```

### Tool Details

Each tool returns structured details alongside its text output. Built-in tools attach a shared machine-readable `details.receipt` (`StructuredReceipt`) in addition to any tool-specific details. The receipt records what ran, where it ran, status, timing, a short output preview, and inspect pointers so UI renderers and extensions can display a consistent non-magical execution summary.

- **`ReadToolDetails`** — `truncation?: TruncationResult`, `receipt?: StructuredReceipt`
- **`BashToolDetails`** — `truncation?: TruncationResult`, `fullOutputPath?: string` (path to temp file with full output when truncated), `receipt?: StructuredReceipt`
- **`EditToolDetails`** — Display-oriented diff, unified patch, first changed line number, `receipt?: StructuredReceipt`
- **`GrepToolDetails`** — Truncation info, match limit reached count, lines truncated flag, `receipt?: StructuredReceipt`
- **`FindToolDetails`** — Truncation info, result limit reached count, `receipt?: StructuredReceipt`
- **`LsToolDetails`** — Truncation info, entry limit reached count, `receipt?: StructuredReceipt`

### Truncation

The `truncate` module provides shared output truncation utilities used by `read`, `grep`, `find`, and `ls`:

```typescript
const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB

interface TruncationOptions {
  /** Maximum number of lines (default: 2000) */
  maxLines?: number;
  /** Maximum number of bytes (default: 50KB) */
  maxBytes?: number;
}

interface TruncationResult {
  /** The truncated content */
  content: string;
  /** Whether truncation occurred */
  truncated: boolean;
  /** Which limit was hit: "lines", "bytes", or null if not truncated */
  truncatedBy: "lines" | "bytes" | null;
  /** Total number of lines in the original content */
  totalLines: number;
  /** Total number of bytes in the original content */
  totalBytes: number;
}

function truncateHead(content: string, options?: TruncationOptions): TruncationResult;
function truncateTail(content: string, options?: TruncationOptions): TruncationResult;
function truncateLine(line: string, maxChars?: number): { text: string; wasTruncated: boolean };
function formatSize(bytes: number): string);
```

## Creating Custom Tools

Extensions can register tools via the `tools` export:

```typescript
export default {
  tools: [
    {
      name: "my-tool",
      description: "Does something useful",
      parameters: { /* TypeBox schema */ },
      execute: async (args) => {
        return { content: [{ type: "text", text: "result" }] };
      },
    },
  ],
};
```

## See Also

- [Extensions](../extensions/extensions.md) - Extension API and tool registration
- [Security](../trust/security.md) - Tool execution security