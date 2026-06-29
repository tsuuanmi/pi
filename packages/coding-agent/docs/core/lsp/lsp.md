# Language Server Protocol (LSP)

Integration with language servers for code intelligence features.

## Overview

Pi integrates with language servers to provide diagnostics, hover information, go-to-definition, and references. LSP is exposed as a built-in tool and can also be used by extensions.

## Supported Features

| Action | LSP Method | Description |
|--------|-----------|-------------|
| `status` | — | Check if a language server is running for a file |
| `diagnostics` | `textDocument/publishDiagnostics` | Real-time error and warning reporting |
| `hover` | `textDocument/hover` | Type information and documentation |
| `definition` | `textDocument/definition` | Go to definition (supports `LocationLink`) |
| `references` | `textDocument/references` | Find all references |

## Default Language Servers

Pi bundles default server configurations:

| Server | Command | File Types | Root Markers |
|--------|---------|------------|--------------|
| `typescript-language-server` | `typescript-language-server --stdio` | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | `package.json`, `tsconfig.json`, `jsconfig.json` |
| `rust-analyzer` | `rust-analyzer` | `.rs` | `Cargo.toml`, `rust-analyzer.toml` |
| `pyright` | `pyright-langserver --stdio` | `.py` | `pyproject.toml`, `setup.py`, `requirements.txt`, `Pipfile`, `.git` |

## Server Configuration

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

Servers are auto-detected from installed system tools. Pi checks if the server command is available on `PATH` before attempting to start it.

## LSP Tool

The LSP integration is exposed as an `lsp` tool with an `action` parameter:

```
lsp({ action: "status", path: "src/file.ts" })
lsp({ action: "diagnostics", path: "src/file.ts" })
lsp({ action: "hover", path: "src/file.ts", line: 10, symbol: "myFunc" })
lsp({ action: "definition", path: "src/file.ts", line: 10, symbol: "MyClass" })
lsp({ action: "references", path: "src/file.ts", line: 10, symbol: "myVar" })
```

For `hover`, `definition`, and `references`, the `line` and `symbol` parameters locate the target within the file.

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

### JSON-RPC Protocol

Communication uses standard JSON-RPC 2.0 over stdio:

- Requests have `id`, `method`, and optional `params`
- Responses have `id`, optional `result`, and optional `error`
- Notifications have `method` and optional `params` (no `id`)

## See Also

- [LSP Package](../../packages/lsp/lsp.md) - Package-level implementation details
- [Extensions](../extensions/extensions.md) - Extension API and LSP integration