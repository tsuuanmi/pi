# MCP Transports

Transport implementations for Model Context Protocol (MCP) servers.

## Overview

The `mcp/transports/` module provides transport layer implementations for communicating with MCP servers:

- **Stdio transport** — Communicates with MCP servers over subprocess stdin/stdout using newline-delimited JSON-RPC 2.0
- **HTTP/SSE transport** — Communicates with MCP servers via HTTP POST requests and Server-Sent Events (SSE)

Both implement the `MCPTransport` interface:

```typescript
type MCPServerStatus = "disconnected" | "connecting" | "connected" | "failed" | "shutting_down";

type MCPTransportEvent =
  | { type: "connected" }
  | { type: "disconnected"; error?: Error }
  | { type: "message"; message: JsonRpcResponse | JsonRpcNotification };

interface MCPTransport {
  connect(): Promise<void>;
  send(request: JsonRpcRequest): Promise<JsonRpcResponse>;
  sendNotification(notification: JsonRpcNotification): Promise<void>;
  startSSEListener?(): Promise<void>;
  disconnect(): Promise<void>;
  onEvent(handler: (event: MCPTransportEvent) => void): () => void;
  status: MCPServerStatus;
}
```

## Stdio Transport

Spawns a subprocess and communicates over stdin/stdout:

```typescript
interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}
```

Features:
- Id-based request/response correlation for concurrent multiplexed calls
- Proper subprocess lifecycle: spawn, SIGTERM, SIGKILL escalation (5s timeout)
- Buffer-based message framing with newline delimiter
- Stderr forwarding for diagnostics

## HTTP/SSE Transport

Connects to remote MCP servers via HTTP POST + SSE:

```typescript
interface HttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
  reconnectIntervalMs?: number;  // Default: 3000
}
```

Features:
- HTTP POST for JSON-RPC requests
- SSE connection for server-initiated events and notifications
- Automatic SSE reconnection with configurable interval

## See Also

- [MCP](../mcp.md) - MCP integration overview
- [MCP Package](../../../packages/mcp/transports/transports.md) - Full transport implementation details