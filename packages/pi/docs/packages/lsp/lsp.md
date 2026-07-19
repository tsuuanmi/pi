# LSP Package

Language Server Protocol integration as a Pi package. Provides code intelligence tools and session management.

**Source:** `src/packages/lsp/`

## Overview

The LSP package provides:

- An `lsp` tool for code intelligence queries (diagnostics, hover, definition, references)
- An `LspSession` class for managing language server lifecycle
- Default server configurations for TypeScript, Rust, and Python
- JSON-RPC 2.0 communication over stdio

## Package Structure

| Module | Description |
|--------|-------------|
| `runtime/types.ts` | LSP protocol types (Position, Range, Location, Diagnostic, etc.) |
| `runtime/defaults.ts` | Default server configurations (typescript-language-server, rust-analyzer, pyright) |
| `runtime/client.ts` | `LspSession` class for server lifecycle and communication |
| `runtime/protocol-utils.ts` | Protocol utilities (URI conversion, hover extraction, position finding) |
| `extensions/lsp.ts` | Extension that registers the LSP tool |
| `tools/lsp-tool.ts` | The `lsp` tool definition and implementation |

## LSP Tool

The LSP integration is exposed as an `lsp` tool with an `action` parameter:

```
lsp({ action: "status", path: "src/file.ts" })
lsp({ action: "diagnostics", path: "src/file.ts" })
lsp({ action: "hover", path: "src/file.ts", line: 10, symbol: "myFunc" })
lsp({ action: "definition", path: "src/file.ts", line: 10, symbol: "MyClass" })
lsp({ action: "references", path: "src/file.ts", line: 10, symbol: "myVar" })
```

### Tool Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum | yes | One of: `status`, `diagnostics`, `hover`, `definition`, `references` |
| `path` | string | yes | File path (relative or absolute) |
| `line` | number | no | 1-indexed line number (for hover, definition, references) |
| `symbol` | string | no | Symbol substring on the target line (for hover, definition, references) |

### Actions

| Action | LSP Method | Description |
|--------|-----------|-------------|
| `status` | — | Check if a language server is running for a file |
| `diagnostics` | `textDocument/publishDiagnostics` | Real-time error and warning reporting |
| `hover` | `textDocument/hover` | Type information and documentation |
| `definition` | `textDocument/definition` | Go to definition (supports `LocationLink`) |
| `references` | `textDocument/references` | Find all references |

## Default Language Servers

| Server | Command | File Types | Root Markers |
|--------|---------|------------|--------------|
| `typescript-language-server` | `typescript-language-server --stdio` | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | `package.json`, `tsconfig.json`, `jsconfig.json` |
| `rust-analyzer` | `rust-analyzer` | `.rs` | `Cargo.toml`, `rust-analyzer.toml` |
| `pyright` | `pyright-langserver --stdio` | `.py` | `pyproject.toml`, `setup.py`, `requirements.txt`, `Pipfile`, `.git` |

Pi auto-detects available servers by checking if the command exists on `PATH`.

## ServerConfig

Language servers are configured via `ServerConfig`:

```typescript
interface ServerConfig {
  command: string;                    // Command to start the server
  args?: string[];                    // Command arguments
  fileTypes: string[];                // File extensions this server handles
  rootMarkers: string[];             // Files/dirs that indicate a project root
  languageId?: string;                // LSP language ID (defaults to file type)
  initializationOptions?: Record<string, unknown>;  // Server-specific init options
}
```

## LspSession

The `LspSession` class manages a language server process lifecycle:

```typescript
const session = new LspSession(serverConfig, {
  rootPath: "/project",
  rootUri: "file:///project",
  workspaceName: "my-project",
  timeoutMs: 20000,
  onDiagnostics: (uri, diagnostics) => { /* handle diagnostics */ },
});

await session.initialize(serverConfig);
session.openFile(fileUri, languageId, fileContent);
const result = await session.request("textDocument/hover", { ... });
```

### Session Lifecycle

1. **Spawn** — The server process is started with `stdio` pipes
2. **Initialize** — `initialize` request with workspace capabilities
3. **Open files** — `textDocument/didOpen` notifications as needed
4. **Query** — Send requests for hover, definition, etc.
5. **Close** — Server process is killed on `close()` or process exit

### Timeouts

- Request timeout defaults to 20 seconds, configurable via `timeoutMs`
- Diagnostic collection waits 1 second after server response before resolving

## JSON-RPC Protocol

Communication uses standard JSON-RPC 2.0 over stdio:

- **Requests** have `id`, `method`, and optional `params`
- **Responses** have `id`, optional `result`, and optional `error`
- **Notifications** have `method` and optional `params` (no `id`)

Message framing is newline-delimited JSON. Request IDs are auto-incremented integers.

## Extension Registration

The LSP extension (`extensions/lsp.ts`) registers the tool and manages sessions:

```typescript
pi.on("session_start", async (_event, ctx) => {
  // Create LspSession, detect available servers, start as needed
});

pi.on("session_shutdown", async () => {
  // Close all sessions
});
```

## See Also

- [LSP (Core)](../../core/lsp/lsp.md) - Core LSP documentation
- [Extensions](../../core/extensions/extensions.md) - Extension API