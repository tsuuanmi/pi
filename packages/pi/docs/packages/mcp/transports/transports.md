# MCP Transports

Transport implementations for MCP server communication.

**Source:** `src/packages/mcp/runtime/transports/`

## Overview

Pi provides two MCP transport implementations:

| Transport | Class | Protocol |
|-----------|-------|----------|
| stdio | `StdioTransport` | Subprocess stdin/stdout (newline-delimited JSON-RPC 2.0) |
| http | `HttpTransport` | HTTP POST requests + SSE event stream |

Both implement the `MCPTransport` interface:

```typescript
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

## MCPServerStatus

```typescript
type MCPServerStatus = "disconnected" | "connecting" | "connected" | "failed" | "shutting_down";
```

## MCPTransportEvent

```typescript
type MCPTransportEvent =
  | { type: "connected" }
  | { type: "disconnected"; error?: Error }
  | { type: "message"; message: JsonRpcResponse | JsonRpcNotification };
```

## StdioTransport

Spawns a subprocess and communicates over stdin/stdout using newline-delimited JSON-RPC 2.0 messages.

### StdioTransportOptions

```typescript
interface StdioTransportOptions {
  command: string;               // Command to execute
  args?: string[];               // Command arguments
  env?: Record<string, string>;  // Environment variables
  cwd?: string;                  // Working directory
}
```

### Features

- Id-based request/response correlation for concurrent multiplexed calls
- Proper subprocess lifecycle: spawn, SIGTERM, SIGKILL escalation
- Buffer-based message framing with newline delimiter
- Stderr forwarding for diagnostics
- Configurable request timeouts via `send()` timeout

### Lifecycle

1. **`connect()`** — Spawn subprocess, set up stdin/stdout listeners
2. **`send(request)`** — Serialize request as JSON + newline, write to stdin, await response by ID
3. **`sendNotification(notification)`** — Serialize and write to stdin, no response expected
4. **`disconnect()`** — Kill subprocess: SIGTERM, then SIGKILL after 5 seconds if unresponsive

### Request Timeout

Each `send()` call has a per-request timeout. If the server doesn't respond within the timeout, the request is rejected with a timeout error. Pending requests are cleaned up on disconnect.

## HttpTransport

Connects to a remote MCP server via HTTP POST for requests and SSE for server-initiated events.

### HttpTransportOptions

```typescript
interface HttpTransportOptions {
  url: string;                           // Server URL
  headers?: Record<string, string>;      // HTTP headers
  reconnectIntervalMs?: number;          // SSE reconnect interval (default: 3000)
}
```

### Features

- HTTP POST for JSON-RPC requests
- SSE connection for server-initiated events and notifications
- Automatic SSE reconnection with configurable interval
- Proper session management

### Lifecycle

1. **`connect()`** — Send `initialize` request via HTTP POST
2. **`startSSEListener()`** — Open SSE connection for server-initiated events
3. **`send(request)`** — Send JSON-RPC request via HTTP POST, return response
4. **`sendNotification(notification)`** — Send notification via HTTP POST
5. **`disconnect()`** — Close SSE connection and clean up

## See Also

- [MCP Package](../mcp.md) - Full MCP package documentation
- [MCP (Core)](../../../core/mcp/mcp.md) - Core MCP documentation