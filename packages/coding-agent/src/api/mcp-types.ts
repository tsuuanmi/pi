/**
 * Public MCP (Model Context Protocol) configuration and status types.
 */

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

/** Connection state of an MCP server. */
export type MCPServerStatus = "disconnected" | "connecting" | "connected" | "failed" | "shutting_down";

/** Status info for a managed MCP server. */
export interface MCPServerInfo {
	name: string;
	status: MCPServerStatus;
	config: MCPServerConfig;
	toolCount: number;
	toolNames: string[];
	error?: string;
}
