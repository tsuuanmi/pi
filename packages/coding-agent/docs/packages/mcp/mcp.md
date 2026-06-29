# MCP Package

Model Context Protocol (MCP) integration as a Pi package. Connects to MCP servers and exposes their tools as Pi tools.

**Source:** `src/packages/mcp/`

## Overview

The MCP package provides:

- Runtime connection to MCP servers via stdio and HTTP/SSE transports
- Automatic tool discovery and registration as Pi tools (`mcp__<server>__<tool>`)
- Configuration file loading (`.mcp.json` project, `~/.pi/mcp.json` global)
- CLI management (`pi mcp list/add/remove/test`)
- Tool result truncation (1MB default)
- Server lifecycle management with auto-reconnect

## Package Structure

| Module | Description |
|--------|-------------|
| `runtime/types.ts` | MCP protocol types, configuration, transport interface |
| `runtime/client.ts` | MCP client (initialize, tool discovery, tool calls) |
| `runtime/loader.ts` | Config file loading and server discovery |
| `runtime/manager.ts` | Server lifecycle management (MCPManager) |
| `runtime/tool-bridge.ts` | Bridge between MCP tool definitions and Pi tool registrations |
| `runtime/transports/stdio.ts` | Stdio transport (subprocess stdin/stdout) |
| `runtime/transports/http.ts` | HTTP/SSE transport (streamable HTTP) |
| `extensions/mcp.ts` | Extension that manages MCP sessions and tool registration |
| `commands/mcp.ts` | CLI commands (`pi mcp list/add/remove/test`) |

## Configuration

Pi reads MCP server config from:

- Project config: `.mcp.json`
- Global config: `~/.pi/mcp.json`

Project config is loaded only for trusted projects. If the same server name exists in both files, the project config wins.

### Config Format

```json
{
  "mcpConfigVersion": 1,
  "mcpServers": {
    "filesystem": {
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
      }
    },
    "remote": {
      "transport": {
        "type": "http",
        "url": "https://example.com/mcp"
      }
    }
  }
}
```

### MCPServerConfig

```typescript
interface MCPServerConfig {
  transport: MCPServerTransport;
  disabled?: boolean;               // Default: false
  startupTimeoutSec?: number;       // Default: 30
  reconnectTimeoutSec?: number;     // Default: 30
  toolCallTimeoutSec?: number;      // Default: 60
}
```

### MCPServerTransport

```typescript
type MCPServerTransport =
  | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  | { type: "http"; url: string; headers?: Record<string, string>; reconnectIntervalMs?: number };
```

Default SSE reconnect interval is 3000ms.

## CLI Management

```bash
pi mcp list                          # List configured servers
pi mcp list --json                   # List as JSON
pi mcp add <name> --command <cmd>    # Add stdio server
pi mcp add <name> --url <url>        # Add HTTP server
pi mcp remove <name>                 # Remove server
pi mcp test <name> --timeout 10      # Test server connectivity
```

`pi mcp add` writes to project `.mcp.json`. Use `--command <cmd>` (stdio) or `--url <url>` (HTTP/SSE); the two are mutually exclusive. `--args` consumes all following positional tokens as command arguments. `--env KEY=VAL` (repeatable) sets environment variables on the stdio transport.

## MCPManager

`MCPManager` orchestrates server lifecycle:

```typescript
interface MCPManagerOptions {
  cwd: string;
  isProjectTrusted: boolean;
}

const manager = new MCPManager(options);
await manager.initialize();            // Start all configured servers
await manager.stopAll();                // Stop all servers
manager.getServerInfos();               // Get status for all servers
manager.onToolsChanged((added, removed) => {
  // Handle tool registration/unregistration
});
```

### MCPServerInfo

```typescript
interface MCPServerInfo {
  name: string;
  status: MCPServerStatus;     // "disconnected" | "connecting" | "connected" | "failed" | "shutting_down"
  config: MCPServerConfig;
  toolCount: number;
  toolNames: string[];
  error?: string;
}
```

## Tool Name Mapping

MCP tools are registered with names following the pattern:

```
mcp__<server>__<tool>
```

Server names are sanitized before registration so tool names are safe for model tool calls.

## Tool Result Truncation

MCP tool results larger than `MCP_MAX_RESULT_BYTES` (1MB) are truncated with a marker indicating the original size:

```
[Result truncated: 2.1MB > 1MB limit]
```

## Transport Lifecycle

### StdioTransport

The stdio transport spawns a subprocess and communicates over stdin/stdout using newline-delimited JSON-RPC 2.0:

1. `connect()` — Spawn subprocess, set up stdin/stdout listeners
2. `send(request)` — Send JSON-RPC request, await response by ID
3. `sendNotification(notification)` — Send JSON-RPC notification
4. `disconnect()` — Kill subprocess (SIGTERM, then SIGKILL after 5s)

Id-based request/response correlation supports concurrent multiplexed calls.

### HttpTransport

The HTTP/SSE transport connects to a remote MCP server via HTTP:

1. `connect()` — Send `initialize` request via HTTP POST
2. `startSSEListener()` — Open SSE connection for server-initiated events
3. `send(request)` — Send JSON-RPC request via HTTP POST
4. `disconnect()` — Close SSE connection

HTTP transport supports automatic reconnection with configurable `reconnectIntervalMs`.

## Extension Registration

The MCP extension (`extensions/mcp.ts`) manages server lifecycle and tool registration:

```typescript
pi.on("session_start", async (_event, ctx) => {
  manager = new MCPManager({ cwd: process.cwd(), isProjectTrusted: ctx.isProjectTrusted() });
  manager.onToolsChanged((added, removed) => {
    // Register/unregister tools with Pi
  });
  await manager.initialize();
});

pi.on("session_shutdown", async () => {
  await manager.stopAll();
});
```

## MCP Protocol Version

Pi implements MCP protocol version `2025-03-26` with client name `pi-coding-agent` version `1.0.0`.

## Scope

Phase 1 MCP support focuses on:

- stdio transport
- HTTP/SSE transport
- tool discovery and calls
- project trust gate for `.mcp.json`
- CLI management and connectivity testing

Not included yet:

- OAuth setup flows
- Server discovery marketplaces
- Prompt/resource MCP surfaces
- Per-tool approval gates

## See Also

- [MCP (Core)](../../core/mcp/mcp.md) - Core MCP documentation
- [Extensions](../../core/extensions/extensions.md) - Extension API