/**
 * MCP (Model Context Protocol) module for Pi.
 *
 * Provides runtime MCP support for connecting to MCP servers and exposing
 * their tools as Pi tools through the standard agent tool dispatch path.
 *
 * Module structure:
 * - types.ts: MCP protocol types, config types, transport interface
 * - process-manager.ts: Subprocess lifecycle management
 * - transports/stdio.ts: Stdio transport (subprocess JSON-RPC over stdin/stdout)
 * - client.ts: MCP client (initialize, discover tools, call tools)
 * - loader.ts: Config discovery and validation (.mcp.json, ~/.pi/mcp.json)
 * - manager.ts: Connection lifecycle management (start/stop/reconnect)
 * - tool-bridge.ts: MCP tool → Pi ToolDefinition conversion
 */

export { MCPClient, type MCPClientOptions, type MCPClientState } from "./client.ts";
export {
	isServerNameAmbiguous,
	loadMCPConfigFile,
	loadMCPConfigs,
	type MCPLoadResult,
	sanitizeServerName,
	validateMCPConfig,
} from "./loader.ts";
export { MCPManager, type MCPManagerOptions } from "./manager.ts";
export { createOwnedProcess, type OwnedProcess, type OwnedProcessOptions } from "./process-manager.ts";
export {
	createMcpToolDefinition,
	createMcpToolDefinitions,
	isMcpToolName,
	jsonSchemaToTypeBox,
	MCP_TOOL_PREFIX,
	type MCPToolDetails,
	mcpResultToText,
	mcpToolName,
	parseMcpToolName,
	truncateMcpResult,
} from "./tool-bridge.ts";
export { HttpTransport, type HttpTransportOptions, parseSseEvents } from "./transports/http.ts";
export { StdioTransport, type StdioTransportOptions } from "./transports/stdio.ts";
export {
	type JsonRpcErrorResponse,
	type JsonRpcNotification,
	type JsonRpcRequest,
	type JsonRpcResponse,
	type JsonRpcSuccessResponse,
	MCP_CLIENT_NAME,
	MCP_CLIENT_VERSION,
	MCP_DEFAULT_RECONNECT_TIMEOUT_SEC,
	MCP_DEFAULT_STARTUP_TIMEOUT_SEC,
	MCP_DEFAULT_TOOL_CALL_TIMEOUT_SEC,
	MCP_MAX_RESULT_BYTES,
	MCP_PROTOCOL_VERSION,
	type MCPConfigFile,
	type MCPConfigVersion,
	type MCPContentBlock,
	type MCPInitializeParams,
	type MCPInitializeResult,
	type MCPServerConfig,
	type MCPServerInfo,
	type MCPServerStatus,
	type MCPServerTransport,
	type MCPToolCallParams,
	type MCPToolCallResult,
	type MCPToolDefinition,
	type MCPTransport,
	type MCPTransportEvent,
} from "./types.ts";
