/**
 * MCP connection lifecycle manager.
 *
 * Manages starting, stopping, reconnecting, and refreshing MCP servers.
 * Handles tool registration/deregistration with the agent session's tool registry.
 */

import type { ToolDefinition as PiToolDefinition } from "@tsuuanmi/pi/api/types";
import { MCPClient } from "#mcp/runtime/client";
import { loadMCPConfigs, sanitizeServerName } from "#mcp/runtime/loader";
import { createMcpToolDefinitions } from "#mcp/runtime/tool-bridge";
import { HttpTransport } from "#mcp/runtime/transports/http";
import { StdioTransport } from "#mcp/runtime/transports/stdio";
import {
	MCP_DEFAULT_RECONNECT_TIMEOUT_SEC,
	MCP_DEFAULT_STARTUP_TIMEOUT_SEC,
	MCP_DEFAULT_TOOL_CALL_TIMEOUT_SEC,
	type MCPServerConfig,
	type MCPServerInfo,
	type MCPServerStatus,
} from "#mcp/runtime/types";

export interface MCPManagerOptions {
	/** Working directory for the project. */
	cwd: string;
	/** Path to global mcp.json (default: ~/.pi/mcp.json). */
	globalMcpJsonPath?: string;
}

interface ManagedServer {
	name: string;
	config: MCPServerConfig;
	client?: MCPClient;
	status: MCPServerStatus;
	tools: PiToolDefinition[];
	error?: string;
	reconnectTimer?: ReturnType<typeof setTimeout>;
}

/**
 * MCP Manager — orchestrates MCP server connections and tool registration.
 *
 * Responsibilities:
 * - Load MCP configs from project and global files
 * - Start/stop/reconnect MCP servers
 * - Convert MCP tools to Pi ToolDefinitions
 * - Provide tool registration/deregistration hooks
 * - Handle server name sanitization and collision detection
 */
export class MCPManager {
	private readonly _options: MCPManagerOptions;
	private _servers: Map<string, ManagedServer> = new Map();
	private _initialized = false;
	private _onToolsChanged?: (added: PiToolDefinition[], removed: string[]) => void;
	private _warnings: string[] = [];
	private _errors: string[] = [];

	constructor(options: MCPManagerOptions) {
		this._options = options;
	}

	/** Set callback for when tools are added or removed. */
	onToolsChanged(handler: (added: PiToolDefinition[], removed: string[]) => void): void {
		this._onToolsChanged = handler;
	}

	/** Get all current warnings. */
	get warnings(): readonly string[] {
		return this._warnings;
	}

	/** Get all current errors. */
	get errors(): readonly string[] {
		return this._errors;
	}

	/** Get info about all managed servers. */
	getServerInfos(): MCPServerInfo[] {
		return Array.from(this._servers.values()).map((server) => ({
			name: server.name,
			status: server.status,
			config: server.config,
			toolCount: server.tools.length,
			toolNames: server.tools.map((t) => t.name),
			error: server.error,
		}));
	}

	/**
	 * Initialize the MCP manager by loading configs and starting servers.
	 *
	 * In-flight tool calls are not tracked — callers should ensure
	 * no MCP tool calls are in progress when calling initialize().
	 */
	async initialize(): Promise<void> {
		if (this._initialized) {
			return;
		}

		this._warnings = [];
		this._errors = [];

		const result = loadMCPConfigs({
			cwd: this._options.cwd,
			globalMcpJsonPath: this._options.globalMcpJsonPath,
		});

		this._warnings.push(...result.warnings);
		this._errors.push(...result.errors);

		// Check for server name ambiguities
		const serverNames = Array.from(result.servers.keys());
		for (let i = 0; i < serverNames.length; i++) {
			for (let j = i + 1; j < serverNames.length; j++) {
				const sanitized1 = sanitizeServerName(serverNames[i]);
				const sanitized2 = sanitizeServerName(serverNames[j]);
				if (sanitized1 === sanitized2 && serverNames[i] !== serverNames[j]) {
					this._warnings.push(
						`MCP server names "${serverNames[i]}" and "${serverNames[j]}" ` +
							`produce the same sanitized name "${sanitized1}". ` +
							`This may cause tool naming ambiguities.`,
					);
				}
			}
		}

		// Start all servers in parallel
		const startPromises: Promise<void>[] = [];
		for (const [name, config] of result.servers) {
			startPromises.push(this._startServer(name, config));
		}

		await Promise.allSettled(startPromises);
		this._initialized = true;
	}

	/**
	 * Reload configs and restart all servers.
	 *
	 * Stops all current servers, reloads configs, and starts new servers.
	 * Tools from removed servers are deregistered; tools from new/changed
	 * servers are registered.
	 */
	async reload(): Promise<void> {
		// Stop all current servers
		await this.stopAll();

		this._initialized = false;
		this._warnings = [];
		this._errors = [];

		// Reinitialize
		await this.initialize();
	}

	/**
	 * Stop all managed servers.
	 */
	async stopAll(): Promise<void> {
		const stopPromises: Promise<void>[] = [];
		for (const server of this._servers.values()) {
			stopPromises.push(this._stopServer(server));
		}
		await Promise.allSettled(stopPromises);
	}

	/**
	 * Stop a specific server by name.
	 */
	async stopServer(name: string): Promise<void> {
		const server = this._servers.get(name);
		if (!server) return;
		await this._stopServer(server);
	}

	/**
	 * Get all currently registered MCP tool definitions.
	 */
	getAllTools(): PiToolDefinition[] {
		const tools: PiToolDefinition[] = [];
		for (const server of this._servers.values()) {
			tools.push(...server.tools);
		}
		return tools;
	}

	/**
	 * Start a single MCP server.
	 */
	private async _startServer(name: string, config: MCPServerConfig): Promise<void> {
		const startupTimeoutSec = config.startupTimeoutSec ?? MCP_DEFAULT_STARTUP_TIMEOUT_SEC;
		const toolCallTimeoutSec = config.toolCallTimeoutSec ?? MCP_DEFAULT_TOOL_CALL_TIMEOUT_SEC;

		const managed: ManagedServer = {
			name,
			config,
			status: "connecting",
			tools: [],
		};

		this._servers.set(name, managed);

		try {
			// Create transport based on config
			if (config.transport.type === "stdio") {
				const transport = new StdioTransport({
					command: config.transport.command,
					args: config.transport.args,
					env: config.transport.env,
					cwd: this._options.cwd,
				});

				const client = new MCPClient({
					transport,
					serverName: name,
					startupTimeoutSec,
					toolCallTimeoutSec,
				});

				managed.client = client;

				// Set up transport event handler for reconnection
				transport.onEvent((event) => {
					if (event.type === "disconnected" && managed.status === "connected") {
						this._handleServerDisconnect(name, managed);
					}
				});

				await client.connect();

				// Create tool definitions from discovered tools
				const { definitions, warnings } = createMcpToolDefinitions(name, client.tools, client);
				this._warnings.push(...warnings);

				managed.tools = definitions;
				managed.status = "connected";
				managed.error = undefined;

				// Notify about new tools
				if (definitions.length > 0 && this._onToolsChanged) {
					this._onToolsChanged(definitions, []);
				}
			} else if (config.transport.type === "http") {
				const transport = new HttpTransport({
					url: config.transport.url,
					headers: config.transport.headers,
					reconnectIntervalMs: config.transport.reconnectIntervalMs,
				});

				const client = new MCPClient({
					transport,
					serverName: name,
					startupTimeoutSec,
					toolCallTimeoutSec,
				});

				managed.client = client;

				// Set up transport event handler for reconnection
				transport.onEvent((event) => {
					if (event.type === "disconnected" && managed.status === "connected") {
						this._handleServerDisconnect(name, managed);
					}
				});

				await client.connect();

				// Create tool definitions from discovered tools
				const { definitions, warnings } = createMcpToolDefinitions(name, client.tools, client);
				this._warnings.push(...warnings);

				managed.tools = definitions;
				managed.status = "connected";
				managed.error = undefined;

				// Notify about new tools
				if (definitions.length > 0 && this._onToolsChanged) {
					this._onToolsChanged(definitions, []);
				}
			}
		} catch (error) {
			managed.status = "failed";
			managed.error = error instanceof Error ? error.message : String(error);
			this._errors.push(`MCP server "${name}" failed to start: ${managed.error}`);
		}
	}

	/**
	 * Stop a single managed server.
	 */
	private async _stopServer(server: ManagedServer): Promise<void> {
		// Clear any reconnect timer
		if (server.reconnectTimer) {
			clearTimeout(server.reconnectTimer);
			server.reconnectTimer = undefined;
		}

		const previousTools = server.tools.map((t) => t.name);
		server.tools = [];

		try {
			await server.client?.disconnect();
		} catch {
			// Ignore disconnect errors
		}

		server.status = "disconnected";

		// Notify about removed tools
		if (previousTools.length > 0 && this._onToolsChanged) {
			this._onToolsChanged([], previousTools);
		}
	}

	/**
	 * Handle a server disconnection event.
	 *
	 * Marks the server as disconnected and schedules a reconnect attempt.
	 * Tools are deregistered immediately.
	 */
	private _handleServerDisconnect(name: string, server: ManagedServer): void {
		const previousTools = server.tools.map((t) => t.name);
		server.tools = [];
		server.status = "disconnected";

		// Notify about removed tools
		if (previousTools.length > 0 && this._onToolsChanged) {
			this._onToolsChanged([], previousTools);
		}

		// Schedule reconnect attempt
		const reconnectTimeoutSec = server.config.reconnectTimeoutSec ?? MCP_DEFAULT_RECONNECT_TIMEOUT_SEC;
		server.reconnectTimer = setTimeout(() => {
			server.reconnectTimer = undefined;
			this._reconnectServer(name).catch((error) => {
				console.error(`MCP server "${name}" reconnect failed:`, error);
			});
		}, reconnectTimeoutSec * 1000);
	}

	/**
	 * Attempt to reconnect a disconnected server.
	 */
	private async _reconnectServer(name: string): Promise<void> {
		const server = this._servers.get(name);
		if (!server || server.status === "connected" || server.status === "connecting") {
			return;
		}

		server.status = "connecting";

		try {
			if (!server.client) throw new Error(`MCP server "${name}" has no client to reconnect`);
			await server.client.connect();

			const { definitions, warnings } = createMcpToolDefinitions(name, server.client.tools, server.client);
			this._warnings.push(...warnings);

			server.tools = definitions;
			server.status = "connected";
			server.error = undefined;

			// Notify about new tools
			if (definitions.length > 0 && this._onToolsChanged) {
				this._onToolsChanged(definitions, []);
			}
		} catch (error) {
			server.status = "failed";
			server.error = error instanceof Error ? error.message : String(error);

			// Schedule another reconnect attempt
			const reconnectTimeoutSec = server.config.reconnectTimeoutSec ?? MCP_DEFAULT_RECONNECT_TIMEOUT_SEC;
			server.reconnectTimer = setTimeout(() => {
				server.reconnectTimer = undefined;
				this._reconnectServer(name).catch((err) => {
					console.error(`MCP server "${name}" reconnect failed:`, err);
				});
			}, reconnectTimeoutSec * 1000);
		}
	}
}
