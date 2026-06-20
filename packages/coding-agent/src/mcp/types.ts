/**
 * MCP (Model Context Protocol) types for Pi.
 *
 * Defines the protocol types, configuration types, and transport interface
 * needed to connect to MCP servers and expose their tools as Pi tools.
 *
 * References: MCP specification 2025-03-26
 */

// ============================================================================
// JSON-RPC 2.0 Types
// ============================================================================

export interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number | string;
	method: string;
	params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: Record<string, unknown>;
}

export interface JsonRpcSuccessResponse {
	jsonrpc: "2.0";
	id: number | string;
	result: unknown;
}

export interface JsonRpcErrorResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	error: {
		code: number;
		message: string;
		data?: unknown;
	};
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// ============================================================================
// MCP Protocol Types
// ============================================================================

export interface MCPInitializeParams {
	protocolVersion: string;
	capabilities: {
		roots?: { listChanged?: boolean };
		sampling?: Record<string, unknown>;
	};
	clientInfo: {
		name: string;
		version: string;
	};
}

export interface MCPInitializeResult {
	protocolVersion: string;
	capabilities: {
		tools?: { listChanged?: boolean };
		resources?: { subscribe?: boolean; listChanged?: boolean };
		prompts?: { listChanged?: boolean };
		logging?: Record<string, unknown>;
	};
	serverInfo: {
		name: string;
		version: string;
	};
	instructions?: string;
}

export interface MCPToolDefinition {
	name: string;
	description?: string;
	inputSchema: {
		type: "object";
		properties?: Record<string, unknown>;
		required?: string[];
		[key: string]: unknown;
	};
	/** Annotations per MCP spec (readOnlyHint, destructiveHint, etc.) */
	annotations?: {
		readOnlyHint?: boolean;
		destructiveHint?: boolean;
		idempotentHint?: boolean;
		openWorldHint?: boolean;
		[key: string]: unknown;
	};
}

export interface MCPToolCallParams {
	name: string;
	arguments?: Record<string, unknown>;
}

export interface MCPToolCallResult {
	content: MCPContentBlock[];
	isError?: boolean;
}

export type MCPContentBlock =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: string }
	| { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

// ============================================================================
// MCP Configuration Types
// ============================================================================

/** Schema version for the MCP config format. Always `1` initially. */
export type MCPConfigVersion = 1;

/** Transport configuration for a single MCP server. */
export type MCPServerTransport =
	| { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
	| {
			type: "http";
			url: string;
			headers?: Record<string, string>;
			/** SSE reconnect interval in milliseconds. Default: 3000 */
			reconnectIntervalMs?: number;
	  };

/** Configuration for a single MCP server. */
export interface MCPServerConfig {
	/** Transport configuration. */
	transport: MCPServerTransport;
	/**
	 * If true, this server is disabled and will not be started.
	 * Default: false
	 */
	disabled?: boolean;
	/**
	 * Startup timeout in seconds. Server that fails to respond to `initialize`
	 * within this time is marked as failed. Default: 30.
	 */
	startupTimeoutSec?: number;
	/**
	 * Reconnect timeout in seconds. After disconnection, the server will be
	 * marked disconnected after this time. Default: 30.
	 */
	reconnectTimeoutSec?: number;
	/**
	 * Tool call timeout in seconds. Default: 60.
	 */
	toolCallTimeoutSec?: number;
}

/**
 * MCP configuration file format.
 *
 * Compatible with the common `.mcp.json` schema so existing MCP server
 * configs work with Pi. Schema version pinning allows Pi to evolve the
 * format independently while remaining compatible with the common subset.
 */
export interface MCPConfigFile {
	/** Schema version for forward-compatible evolution. Always `1` initially. */
	mcpConfigVersion: MCPConfigVersion;
	/** Named MCP server configurations. */
	mcpServers: Record<string, MCPServerConfig>;
}

// ============================================================================
// MCP Transport Interface
// ============================================================================

/** Connection state of an MCP server. */
export type MCPServerStatus = "disconnected" | "connecting" | "connected" | "failed" | "shutting_down";

/** Event emitted by transports. */
export type MCPTransportEvent =
	| { type: "connected" }
	| { type: "disconnected"; error?: Error }
	| { type: "message"; message: JsonRpcResponse | JsonRpcNotification };

/** Interface for MCP transports (stdio, http/sse, etc.). */
export interface MCPTransport {
	/** Start the transport and connect to the server. */
	connect(): Promise<void>;

	/** Send a JSON-RPC request to the server and return the response. */
	send(request: JsonRpcRequest): Promise<JsonRpcResponse>;

	/** Send a JSON-RPC notification to the server. */
	sendNotification(notification: JsonRpcNotification): Promise<void>;

	/** Optional hook for transports that open an out-of-band server event stream after initialize. */
	startSSEListener?(): Promise<void>;

	/** Disconnect from the server. */
	disconnect(): Promise<void>;

	/** Subscribe to transport events. Returns unsubscribe function. */
	onEvent(handler: (event: MCPTransportEvent) => void): () => void;

	/** Current connection status. */
	status: MCPServerStatus;
}

// ============================================================================
// MCP Manager Types
// ============================================================================

/** Status info for a managed MCP server. */
export interface MCPServerInfo {
	name: string;
	status: MCPServerStatus;
	config: MCPServerConfig;
	toolCount: number;
	toolNames: string[];
	error?: string;
}

// ============================================================================
// Result Truncation
// ============================================================================

/** Maximum size for MCP tool results before truncation. */
export const MCP_MAX_RESULT_BYTES = 1 * 1024 * 1024; // 1MB

// ============================================================================
// Constants
// ============================================================================

export const MCP_PROTOCOL_VERSION = "2025-03-26";
export const MCP_CLIENT_NAME = "pi-coding-agent";
export const MCP_CLIENT_VERSION = "1.0.0";
export const MCP_DEFAULT_STARTUP_TIMEOUT_SEC = 30;
export const MCP_DEFAULT_RECONNECT_TIMEOUT_SEC = 30;
export const MCP_DEFAULT_TOOL_CALL_TIMEOUT_SEC = 60;
