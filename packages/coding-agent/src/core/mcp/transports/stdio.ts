/**
 * MCP stdio transport.
 *
 * Implements the MCP JSON-RPC 2.0 protocol over subprocess stdin/stdout.
 * Uses newline-delimited JSON for message framing and id-based
 * request/response correlation for concurrent multiplexed calls.
 */

import { type ChildProcess, spawn } from "node:child_process";
import type {
	JsonRpcErrorResponse,
	JsonRpcNotification,
	JsonRpcRequest,
	JsonRpcResponse,
	JsonRpcSuccessResponse,
	MCPServerStatus,
	MCPTransport,
	MCPTransportEvent,
} from "../types.ts";

export interface StdioTransportOptions {
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

interface PendingRequest {
	resolve: (response: JsonRpcResponse) => void;
	timeout: ReturnType<typeof setTimeout>;
}

/**
 * MCP stdio transport: spawns a subprocess and communicates over
 * stdin/stdout using newline-delimited JSON-RPC 2.0 messages.
 *
 * Features:
 * - Id-based request/response correlation for concurrent multiplexed calls
 * - Proper subprocess lifecycle: spawn, SIGTERM, SIGKILL escalation
 * - Buffer-based message framing with newline delimiter
 * - Stderr forwarding for diagnostics
 */
export class StdioTransport implements MCPTransport {
	private _status: MCPServerStatus = "disconnected";
	private _eventHandlers: ((event: MCPTransportEvent) => void)[] = [];
	private _pendingRequests: Map<number | string, PendingRequest> = new Map();
	private _nextId = 1;
	private _buffer = "";
	private _child: ChildProcess | undefined;
	private _disconnected = false;
	private readonly _options: StdioTransportOptions;

	constructor(options: StdioTransportOptions) {
		this._options = options;
	}

	get status(): MCPServerStatus {
		return this._status;
	}

	async connect(): Promise<void> {
		if (this._status === "connected" || this._status === "connecting") {
			return;
		}

		this._status = "connecting";
		this._disconnected = false;

		const env = {
			...process.env,
			...this._options.env,
		};

		this._child = spawn(this._options.command, this._options.args ?? [], {
			cwd: this._options.cwd,
			env,
			stdio: ["pipe", "pipe", "pipe"],
		});

		if (!this._child.pid) {
			// Process didn't spawn — wait for error
			const error = await new Promise<Error | null>((resolve) => {
				this._child!.on("error", (err) => resolve(err));
				// Give it a tick to see if it exits immediately
				setTimeout(() => resolve(null), 0);
			});
			this._status = "failed";
			throw new Error(`Failed to start MCP server "${this._options.command}": ${error?.message ?? "unknown error"}`);
		}

		// Wire up stdout reader
		this._child.stdout!.on("data", (data: Buffer) => {
			this._handleStdoutData(data);
		});

		// Log stderr for diagnostics but don't treat it as protocol data
		this._child.stderr!.on("data", (data: Buffer) => {
			// Could emit as a diagnostic event in the future
			const text = data.toString("utf-8").trim();
			if (text) {
				this._emit({
					type: "message",
					message: { jsonrpc: "2.0", method: "notifications/stderr", params: { text } },
				});
			}
		});

		this._child.on("error", (err) => {
			if (this._status === "connecting" || this._status === "connected") {
				this._handleDisconnect(new Error(`MCP server process error: ${err.message}`));
			}
		});

		this._child.on("exit", (code, signal) => {
			if (!this._disconnected) {
				this._handleDisconnect(new Error(`MCP server process exited with code ${code}, signal ${signal}`));
			}
		});

		this._status = "connected";
		this._emit({ type: "connected" });
	}

	async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
		if (this._status !== "connected" || !this._child || this._child.killed) {
			return {
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code: -32000,
					message: "MCP server not connected",
				},
			} satisfies JsonRpcErrorResponse;
		}

		const id = request.id;
		const message = `${JSON.stringify(request)}\n`;

		return new Promise<JsonRpcResponse>((resolve) => {
			const timeout = setTimeout(() => {
				this._pendingRequests.delete(id);
				resolve({
					jsonrpc: "2.0",
					id,
					error: {
						code: -32000,
						message: `MCP request timed out (method: ${request.method})`,
					},
				} satisfies JsonRpcErrorResponse);
			}, 120_000); // 2 minute hard timeout

			this._pendingRequests.set(id, { resolve, timeout });

			try {
				this._child!.stdin!.write(message);
			} catch (error) {
				clearTimeout(timeout);
				this._pendingRequests.delete(id);
				resolve({
					jsonrpc: "2.0",
					id,
					error: {
						code: -32000,
						message: `Failed to send message to MCP server: ${error instanceof Error ? error.message : String(error)}`,
					},
				} satisfies JsonRpcErrorResponse);
			}
		});
	}

	async sendNotification(notification: JsonRpcNotification): Promise<void> {
		if (this._status !== "connected" || !this._child || this._child.killed) {
			return;
		}

		const message = `${JSON.stringify(notification)}\n`;
		try {
			this._child.stdin!.write(message);
		} catch {
			// Silently ignore — notifications are fire-and-forget
		}
	}

	private async _sendResponse(response: JsonRpcSuccessResponse | JsonRpcErrorResponse): Promise<void> {
		if (this._status !== "connected" || !this._child || this._child.killed) return;
		try {
			this._child.stdin!.write(`${JSON.stringify(response)}\n`);
		} catch {
			// Best-effort response delivery.
		}
	}

	async disconnect(): Promise<void> {
		if (this._status === "disconnected" || this._status === "shutting_down") {
			return;
		}

		this._status = "shutting_down";
		this._disconnected = true;

		if (this._child && !this._child.killed) {
			// Graceful shutdown: close stdin, then SIGTERM, then SIGKILL
			try {
				this._child.stdin!.end();
			} catch {
				// Ignore
			}

			try {
				this._child.kill("SIGTERM");
			} catch {
				// Ignore
			}

			// Wait for exit with SIGKILL escalation
			await new Promise<void>((resolve) => {
				const killTimer = setTimeout(() => {
					if (this._child && !this._child.killed) {
						try {
							this._child.kill("SIGKILL");
						} catch {
							// Already dead
						}
					}
					resolve();
				}, 5000);

				this._child!.on("exit", () => {
					clearTimeout(killTimer);
					resolve();
				});

				// Safety timeout
				setTimeout(resolve, 10000);
			});
		}

		// Resolve all pending requests with error
		for (const [id, pending] of this._pendingRequests) {
			clearTimeout(pending.timeout);
			pending.resolve({
				jsonrpc: "2.0",
				id,
				error: {
					code: -32000,
					message: "MCP server disconnected",
				},
			} satisfies JsonRpcErrorResponse);
		}
		this._pendingRequests.clear();

		this._status = "disconnected";
		this._emit({ type: "disconnected" });
	}

	onEvent(handler: (event: MCPTransportEvent) => void): () => void {
		this._eventHandlers.push(handler);
		return () => {
			const index = this._eventHandlers.indexOf(handler);
			if (index !== -1) {
				this._eventHandlers.splice(index, 1);
			}
		};
	}

	/** Allocate the next JSON-RPC request id. */
	nextId(): number {
		return this._nextId++;
	}

	private _emit(event: MCPTransportEvent): void {
		for (const handler of this._eventHandlers) {
			try {
				handler(event);
			} catch {
				// Ignore handler errors
			}
		}
	}

	private _handleStdoutData(data: Buffer): void {
		this._buffer += data.toString("utf-8");
		this._processBuffer();
	}

	private _processBuffer(): void {
		while (true) {
			const newlineIndex = this._buffer.indexOf("\n");
			if (newlineIndex === -1) break;

			const line = this._buffer.slice(0, newlineIndex).trim();
			this._buffer = this._buffer.slice(newlineIndex + 1);

			if (!line) continue;

			try {
				const message = JSON.parse(line);

				if ("method" in message && "id" in message && message.id !== null && message.id !== undefined) {
					void this._handleServerRequest(message as JsonRpcRequest);
				} else if ("id" in message && message.id !== null && message.id !== undefined) {
					// This is a response to a pending request
					const pending = this._pendingRequests.get(message.id);
					if (pending) {
						clearTimeout(pending.timeout);
						this._pendingRequests.delete(message.id);
						pending.resolve(message as JsonRpcResponse);
					}
				} else if ("method" in message) {
					// This is a notification from the server
					this._emit({ type: "message", message: message as JsonRpcNotification });
				}
				// Ignore unknown message types
			} catch {
				// Ignore malformed JSON lines — MCP servers may output
				// non-JSON diagnostics to stdout in rare cases
			}
		}
	}

	private async _handleServerRequest(request: JsonRpcRequest): Promise<void> {
		if (request.method === "ping") {
			await this._sendResponse({ jsonrpc: "2.0", id: request.id, result: {} });
			return;
		}
		if (request.method === "roots/list") {
			await this._sendResponse({ jsonrpc: "2.0", id: request.id, result: { roots: [] } });
			return;
		}
		await this._sendResponse({
			jsonrpc: "2.0",
			id: request.id,
			error: { code: -32601, message: `Unsupported server request: ${request.method}` },
		});
	}

	private _handleDisconnect(error: Error): void {
		this._disconnected = true;

		// Resolve all pending requests with error response
		for (const [id, pending] of this._pendingRequests) {
			clearTimeout(pending.timeout);
			pending.resolve({
				jsonrpc: "2.0",
				id,
				error: {
					code: -32000,
					message: error.message,
				},
			} satisfies JsonRpcErrorResponse);
		}
		this._pendingRequests.clear();

		const previousStatus = this._status;
		this._status = "disconnected";
		if (previousStatus !== "disconnected") {
			this._emit({ type: "disconnected", error });
		}
	}
}
