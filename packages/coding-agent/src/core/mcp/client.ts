/**
 * MCP client — initializes, discovers tools, and calls tools on an MCP server.
 *
 * Uses a transport (stdio, http/sse) for the JSON-RPC 2.0 wire protocol.
 * Implements the MCP initialization handshake and tool discovery.
 */

import {
	type JsonRpcErrorResponse,
	type JsonRpcRequest,
	type JsonRpcResponse,
	type JsonRpcSuccessResponse,
	MCP_CLIENT_NAME,
	MCP_CLIENT_VERSION,
	MCP_DEFAULT_STARTUP_TIMEOUT_SEC,
	MCP_DEFAULT_TOOL_CALL_TIMEOUT_SEC,
	MCP_PROTOCOL_VERSION,
	type MCPInitializeResult,
	type MCPToolCallParams,
	type MCPToolCallResult,
	type MCPToolDefinition,
	type MCPTransport,
} from "../../mcp/types.ts";

/** Type guard: narrow JsonRpcResponse to success response. */
function isSuccessResponse(response: JsonRpcResponse): response is JsonRpcSuccessResponse {
	return "result" in response;
}

/** Extract error message from an error response. */
function extractErrorMessage(error: JsonRpcErrorResponse["error"]): string {
	if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
		return error.message;
	}
	return String(error);
}

export interface MCPClientOptions {
	/** Transport to use for communication. */
	transport: MCPTransport;
	/** Server name (for logging/diagnostics). */
	serverName: string;
	/** Startup timeout in seconds. Default: 30. */
	startupTimeoutSec?: number;
	/** Tool call timeout in seconds. Default: 60. */
	toolCallTimeoutSec?: number;
}

export interface MCPClientState {
	connected: boolean;
	initialized: boolean;
	serverInfo?: { name: string; version: string };
	protocolVersion?: string;
	tools: MCPToolDefinition[];
}

/**
 * MCP client that communicates with a single MCP server.
 *
 * Handles:
 * - The initialize/capabilities handshake
 * - Tool discovery (tools/list)
 * - Tool calls (tools/call)
 * - Connection lifecycle (connect, disconnect, reconnect)
 */
export class MCPClient {
	private readonly _transport: MCPTransport;
	private readonly _serverName: string;
	private readonly _startupTimeoutSec: number;
	private readonly _toolCallTimeoutSec: number;
	private _nextId = 1;
	private _initialized = false;
	private _serverInfo: { name: string; version: string } | undefined;
	private _tools: MCPToolDefinition[] = [];
	private _disconnected = false;

	constructor(options: MCPClientOptions) {
		this._transport = options.transport;
		this._serverName = options.serverName;
		this._startupTimeoutSec = options.startupTimeoutSec ?? MCP_DEFAULT_STARTUP_TIMEOUT_SEC;
		this._toolCallTimeoutSec = options.toolCallTimeoutSec ?? MCP_DEFAULT_TOOL_CALL_TIMEOUT_SEC;

		this._transport.onEvent((event) => {
			if (event.type === "disconnected" && !this._disconnected) {
				this._disconnected = true;
				this._initialized = false;
			}
		});
	}

	get transport(): MCPTransport {
		return this._transport;
	}

	get serverName(): string {
		return this._serverName;
	}

	get connected(): boolean {
		return this._transport.status === "connected" && !this._disconnected;
	}

	get initialized(): boolean {
		return this._initialized;
	}

	get serverInfo(): { name: string; version: string } | undefined {
		return this._serverInfo;
	}

	get tools(): MCPToolDefinition[] {
		return this._tools;
	}

	/**
	 * Connect to the MCP server and perform the initialization handshake.
	 *
	 * Steps:
	 * 1. Connect the transport
	 * 2. Send `initialize` request
	 * 3. Send `notifications/initialized`
	 * 4. Fetch tools via `tools/list`
	 */
	async connect(): Promise<void> {
		this._disconnected = false;

		await this._transport.connect();

		// Send initialize request
		const initResponse = await this._sendRequest("initialize", {
			protocolVersion: MCP_PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: {
				name: MCP_CLIENT_NAME,
				version: MCP_CLIENT_VERSION,
			},
		});

		if (!isSuccessResponse(initResponse)) {
			await this._transport.disconnect();
			throw new Error(
				`MCP server "${this._serverName}" initialize failed: ${extractErrorMessage(initResponse.error)}`,
			);
		}

		const initResult = initResponse.result as MCPInitializeResult;
		this._serverInfo = initResult.serverInfo;

		// Open optional server event streams before notifying initialized, so servers
		// can deliver initialization-triggered messages on the established channel.
		await this._transport.startSSEListener?.();

		// Send initialized notification
		await this._transport.sendNotification({
			jsonrpc: "2.0",
			method: "notifications/initialized",
		});

		this._initialized = true;

		// Fetch tools
		await this.refreshTools();
	}

	/**
	 * Refresh the tool list from the server.
	 */
	async refreshTools(): Promise<MCPToolDefinition[]> {
		if (!this._initialized) {
			throw new Error(`MCP client for "${this._serverName}" is not initialized`);
		}

		const response = await this._sendRequest("tools/list", {});

		if (!isSuccessResponse(response)) {
			throw new Error(`MCP server "${this._serverName}" tools/list failed: ${extractErrorMessage(response.error)}`);
		}

		const result = response.result as { tools: MCPToolDefinition[] };
		this._tools = result.tools ?? [];

		if (this._tools.length === 0) {
			// Log a warning but don't treat as error — zero-tool servers are valid
			console.warn(
				`MCP server "${this._serverName}" reports no tools. ` +
					"The connection will remain active but no tools will be registered.",
			);
		}

		return this._tools;
	}

	/**
	 * Call a tool on the MCP server.
	 */
	async callTool(params: MCPToolCallParams): Promise<MCPToolCallResult> {
		if (!this._initialized) {
			return {
				content: [{ type: "text", text: `MCP client for "${this._serverName}" is not initialized` }],
				isError: true,
			};
		}

		const response = await this._sendRequest("tools/call", {
			name: params.name,
			arguments: params.arguments ?? {},
		});

		if (!isSuccessResponse(response)) {
			return {
				content: [
					{
						type: "text",
						text: `MCP tool call error: ${extractErrorMessage(response.error)}`,
					},
				],
				isError: true,
			};
		}

		return response.result as MCPToolCallResult;
	}

	/**
	 * Disconnect from the MCP server.
	 */
	async disconnect(): Promise<void> {
		this._disconnected = true;
		this._initialized = false;
		this._tools = [];
		await this._transport.disconnect();
	}

	/**
	 * Send a JSON-RPC request with a timeout.
	 */
	private async _sendRequest(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
		const id = this._nextId++;
		const timeoutMs = method === "initialize" ? this._startupTimeoutSec * 1000 : this._toolCallTimeoutSec * 1000;

		const request: JsonRpcRequest = {
			jsonrpc: "2.0",
			id,
			method,
			params,
		};

		// Race the transport send against a timeout
		const response = await Promise.race([
			this._transport.send(request),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error(`MCP request timed out (method: ${method}, id: ${id})`)), timeoutMs),
			),
		]);

		return response;
	}
}
