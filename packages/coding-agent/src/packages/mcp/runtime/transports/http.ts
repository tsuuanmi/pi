/**
 * MCP HTTP/SSE transport (Streamable HTTP).
 *
 * Implements JSON-RPC 2.0 over HTTP POST with optional SSE streaming
 * for server-initiated messages and batched responses.
 * Based on MCP spec 2025-03-26.
 *
 * Features:
 * - POST for client requests with JSON or SSE response
 * - SSE listener for server-initiated notifications/requests
 * - Mcp-Session-Id header propagation
 * - Id-based request/response correlation for concurrent multiplexed calls
 * - Configurable timeout and reconnect
 * - Graceful disconnection with DELETE session termination
 */

import type {
	JsonRpcErrorResponse,
	JsonRpcNotification,
	JsonRpcRequest,
	JsonRpcResponse,
	JsonRpcSuccessResponse,
	MCPServerStatus,
	MCPTransport,
	MCPTransportEvent,
} from "#mcp/runtime/types";

export interface HttpTransportOptions {
	/** Server URL (HTTP or HTTPS). */
	url: string;
	/** Additional HTTP headers to send with each request. */
	headers?: Record<string, string>;
	/** Request timeout in milliseconds. Default: 30000 */
	timeoutMs?: number;
	/** SSE reconnect interval in milliseconds. Default: 3000 */
	reconnectIntervalMs?: number;
}

interface PendingRequest {
	resolve: (response: JsonRpcResponse) => void;
	timeout: ReturnType<typeof setTimeout>;
}

/**
 * SSE event parsed from an SSE stream.
 * Based on the Server-Sent Events specification.
 */
interface SseEvent {
	event: string | null;
	data: string;
}

/**
 * Parse an SSE text stream into individual events.
 *
 * Yields complete events on blank-line boundaries per the SSE spec.
 * Handles multi-line `data:` fields (joined by `\n`).
 * Handles `event:` fields.
 * Ignores `id:` and `retry:` fields.
 * Ignores comment lines (`:`).
 */
export async function* parseSseEvents(
	stream: ReadableStream<Uint8Array>,
	signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
	const reader = stream.getReader();
	const decoder = new TextDecoder("utf-8");
	let buffer = "";

	interface SseEventState {
		event: string | null;
		data: string | null;
	}

	function flushEvent(state: SseEventState): SseEvent | null {
		if (state.event === null && state.data === null) return null;
		const event: SseEvent = {
			event: state.event,
			data: state.data ?? "",
		};
		state.event = null;
		state.data = null;
		return event;
	}

	function pushLine(line: string, state: SseEventState): SseEvent | null {
		// Comment line
		if (line.startsWith(":")) return null;

		const colonIndex = line.indexOf(":");
		const fieldName = colonIndex === -1 ? line : line.slice(0, colonIndex);
		let value = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
		// SSE spec: strip one leading space from value
		if (value.startsWith(" ")) value = value.slice(1);

		if (fieldName === "event") {
			state.event = value;
		} else if (fieldName === "data") {
			if (state.data === null) {
				state.data = value;
			} else {
				state.data += "\n";
				state.data += value;
			}
		}
		// Ignore id: and retry: fields
		return null;
	}

	const state: SseEventState = { event: null, data: null };

	try {
		while (true) {
			if (signal?.aborted) return;

			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// Process lines from buffer
			while (true) {
				const newlineIndex = buffer.indexOf("\n");
				if (newlineIndex === -1) break;

				const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
				buffer = buffer.slice(newlineIndex + 1);

				if (line === "") {
					// Blank line dispatches the event
					const event = flushEvent(state);
					if (event) yield event;
				} else {
					const event = pushLine(line, state);
					if (event) yield event;
				}
			}
		}

		// Flush any remaining partial event (no trailing blank line)
		const trailing = flushEvent(state);
		if (trailing) yield trailing;
	} catch (error) {
		if (signal?.aborted) return;
		throw error;
	} finally {
		reader.releaseLock();
	}
}

/**
 * Parse JSON from SSE data, handling `[DONE]` sentinel and empty data lines.
 */
function parseSseJson(data: string): unknown | undefined {
	if (data === "" || data === "[DONE]") return undefined;
	try {
		return JSON.parse(data);
	} catch {
		return undefined;
	}
}

/**
 * Type guard: check if a value is a JSON-RPC response (has "id" and
 * either "result" or "error").
 */
function isJsonRpcResponse(msg: unknown): msg is JsonRpcResponse {
	if (typeof msg !== "object" || msg === null) return false;
	const obj = msg as Record<string, unknown>;
	return (
		obj.jsonrpc === "2.0" &&
		"id" in obj &&
		(obj.id === null || typeof obj.id === "number" || typeof obj.id === "string") &&
		("result" in obj || "error" in obj)
	);
}

/**
 * Type guard: check if a value is a JSON-RPC request (has "method" and "id").
 */
function isJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
	if (typeof msg !== "object" || msg === null) return false;
	const obj = msg as Record<string, unknown>;
	return (
		obj.jsonrpc === "2.0" &&
		"id" in obj &&
		(typeof obj.id === "number" || typeof obj.id === "string") &&
		"method" in obj &&
		typeof obj.method === "string"
	);
}

/**
 * Type guard: check if a value is a JSON-RPC notification (has "method" and no "id").
 */
function isJsonRpcNotification(msg: unknown): msg is JsonRpcNotification {
	if (typeof msg !== "object" || msg === null) return false;
	const obj = msg as Record<string, unknown>;
	return obj.jsonrpc === "2.0" && "method" in obj && typeof obj.method === "string" && !("id" in obj);
}

/**
 * HTTP/SSE transport for MCP servers.
 *
 * Uses HTTP POST for client requests and SSE for server-initiated
 * messages. Supports the Streamable HTTP pattern from MCP spec 2025-03-26:
 * - POST a JSON-RPC request; response may be JSON or SSE stream
 * - GET endpoint for SSE listener (server-initiated messages)
 * - DELETE for session termination
 * - Mcp-Session-Id header for session tracking
 */
export class HttpTransport implements MCPTransport {
	private _status: MCPServerStatus = "disconnected";
	private _eventHandlers: ((event: MCPTransportEvent) => void)[] = [];
	private _pendingRequests: Map<number | string, PendingRequest> = new Map();
	private _nextId = 1;
	private _sessionId: string | null = null;
	private _disconnected = false;
	private _sseAbortController: AbortController | null = null;
	private readonly _options: HttpTransportOptions;

	constructor(options: HttpTransportOptions) {
		this._options = options;
	}

	get status(): MCPServerStatus {
		return this._status;
	}

	/** The Mcp-Session-Id received from the server, if any. */
	get sessionId(): string | null {
		return this._sessionId;
	}

	async connect(): Promise<void> {
		if (this._status === "connected" || this._status === "connecting") {
			return;
		}

		this._status = "connecting";
		this._disconnected = false;

		this._status = "connected";
		this._emit({ type: "connected" });
	}

	async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
		if (this._status !== "connected" || this._disconnected) {
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
		const timeoutMs = this._options.timeoutMs ?? 30_000;

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
			}, timeoutMs);

			this._pendingRequests.set(id, { resolve, timeout });

			this._sendRequest(request).then(
				(response) => {
					// If still pending, resolve with the response
					const pending = this._pendingRequests.get(id);
					if (pending) {
						clearTimeout(pending.timeout);
						this._pendingRequests.delete(id);
						pending.resolve(response);
					}
					// If not pending, it was already resolved by timeout or disconnect
				},
				(error) => {
					const pending = this._pendingRequests.get(id);
					if (pending) {
						clearTimeout(pending.timeout);
						this._pendingRequests.delete(id);
						pending.resolve({
							jsonrpc: "2.0",
							id,
							error: {
								code: -32603,
								message: error instanceof Error ? error.message : String(error),
							},
						} satisfies JsonRpcErrorResponse);
					}
				},
			);
		});
	}

	async sendNotification(notification: JsonRpcNotification): Promise<void> {
		if (this._status !== "connected" || this._disconnected) return;

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			...(this._options.headers ?? {}),
		};
		if (this._sessionId) {
			headers["Mcp-Session-Id"] = this._sessionId;
		}

		try {
			const response = await fetch(this._options.url, {
				method: "POST",
				headers,
				body: JSON.stringify(notification),
				signal: AbortSignal.timeout(this._options.timeoutMs ?? 30_000),
			});

			// Capture session ID from response
			const newSessionId = response.headers.get("Mcp-Session-Id");
			if (newSessionId) {
				this._sessionId = newSessionId;
			}

			// Notifications may receive SSE responses with server-initiated messages
			const contentType = response.headers.get("Content-Type") ?? "";
			if (contentType.includes("text/event-stream") && response.body) {
				// Read SSE events from the notification response
				try {
					for await (const sseEvent of parseSseEvents(response.body)) {
						const msg = parseSseJson(sseEvent.data);
						if (msg !== undefined && isJsonRpcRequest(msg)) {
							void this._handleServerRequest(msg);
						} else if (msg !== undefined && isJsonRpcNotification(msg)) {
							this._emit({ type: "message", message: msg });
						}
					}
				} catch {
					// Best-effort — discard SSE from notification response
				}
			} else {
				// Consume and discard the response body
				await response.body?.cancel().catch(() => {});
			}
		} catch {
			// Notifications are fire-and-forget
		}
	}

	private async _sendResponse(response: JsonRpcSuccessResponse | JsonRpcErrorResponse): Promise<void> {
		if (this._status !== "connected" || this._disconnected) return;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			...(this._options.headers ?? {}),
		};
		if (this._sessionId) {
			headers["Mcp-Session-Id"] = this._sessionId;
		}
		try {
			const resp = await fetch(this._options.url, {
				method: "POST",
				headers,
				body: JSON.stringify(response),
				signal: AbortSignal.timeout(this._options.timeoutMs ?? 30_000),
			});
			await resp.body?.cancel().catch(() => {});
		} catch {
			// Best-effort response delivery.
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

	async disconnect(): Promise<void> {
		if (this._status === "disconnected" || this._status === "shutting_down") {
			return;
		}

		this._status = "shutting_down";
		this._disconnected = true;

		// Abort SSE listener
		this._sseAbortController?.abort();
		this._sseAbortController = null;

		// Send DELETE to terminate session (best-effort)
		if (this._sessionId) {
			try {
				const headers: Record<string, string> = {
					...(this._options.headers ?? {}),
					"Mcp-Session-Id": this._sessionId,
				};
				await fetch(this._options.url, {
					method: "DELETE",
					headers,
					signal: AbortSignal.timeout(5000),
				});
			} catch {
				// Ignore — session termination is best-effort
			}
			this._sessionId = null;
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

	/** Start the optional SSE listener for server-initiated messages. */
	async startSSEListener(): Promise<void> {
		await this._startSSEListener();
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

	/**
	 * Send a JSON-RPC request via HTTP POST and handle the response.
	 *
	 * The response may be:
	 * 1. A JSON object (standard JSON-RPC response)
	 * 2. An SSE stream (Streamable HTTP) containing the response
	 */
	private async _sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			...(this._options.headers ?? {}),
		};
		if (this._sessionId) {
			headers["Mcp-Session-Id"] = this._sessionId;
		}

		const response = await fetch(this._options.url, {
			method: "POST",
			headers,
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(this._options.timeoutMs ?? 30_000),
		});

		// Capture session ID from response
		const newSessionId = response.headers.get("Mcp-Session-Id");
		if (newSessionId) {
			this._sessionId = newSessionId;
		}

		if (!response.ok) {
			const text = await response.text();
			return {
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code: -32000,
					message: `HTTP ${response.status}: ${text}`,
				},
			} satisfies JsonRpcErrorResponse;
		}

		const contentType = response.headers.get("Content-Type") ?? "";

		// Handle SSE response
		if (contentType.includes("text/event-stream") && response.body) {
			return this._parseSSEResponse(request.id, response);
		}

		// Handle JSON response
		if (!response.body) {
			return {
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code: -32603,
					message: "Empty response body from MCP server",
				},
			} satisfies JsonRpcErrorResponse;
		}

		try {
			const result = (await response.json()) as JsonRpcResponse;

			if (isJsonRpcResponse(result)) {
				return result;
			}

			return {
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code: -32603,
					message: "Invalid JSON-RPC response from MCP server",
				},
			} satisfies JsonRpcErrorResponse;
		} catch (error) {
			return {
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code: -32603,
					message: `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`,
				},
			} satisfies JsonRpcErrorResponse;
		}
	}

	/**
	 * Parse an SSE response stream to find the JSON-RPC response
	 * matching the expected request id.
	 *
	 * Non-matching messages (notifications, server-initiated requests)
	 * are dispatched as transport events.
	 */
	private async _parseSSEResponse(expectedId: number | string, response: Response): Promise<JsonRpcResponse> {
		if (!response.body) {
			return {
				jsonrpc: "2.0",
				id: expectedId,
				error: {
					code: -32603,
					message: "No response body for SSE response",
				},
			} satisfies JsonRpcErrorResponse;
		}

		const abortController = new AbortController();
		const timeoutMs = this._options.timeoutMs ?? 30_000;
		const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

		try {
			for await (const sseEvent of parseSseEvents(response.body, abortController.signal)) {
				const msg = parseSseJson(sseEvent.data);
				if (msg === undefined) continue;

				// Check if this is the response we're looking for
				if (isJsonRpcResponse(msg) && msg.id === expectedId) {
					clearTimeout(timeoutId);
					return msg;
				}

				// Dispatch other messages as events or request handlers.
				if (isJsonRpcRequest(msg)) {
					void this._handleServerRequest(msg);
				} else if (isJsonRpcNotification(msg)) {
					this._emit({ type: "message", message: msg });
				}
			}

			// No matching response found in the stream
			clearTimeout(timeoutId);
			return {
				jsonrpc: "2.0",
				id: expectedId,
				error: {
					code: -32603,
					message: "No response received in SSE stream",
				},
			} satisfies JsonRpcErrorResponse;
		} catch (error) {
			clearTimeout(timeoutId);
			if (abortController.signal.aborted) {
				return {
					jsonrpc: "2.0",
					id: expectedId,
					error: {
						code: -32000,
						message: `SSE response timed out after ${timeoutMs}ms`,
					},
				} satisfies JsonRpcErrorResponse;
			}
			return {
				jsonrpc: "2.0",
				id: expectedId,
				error: {
					code: -32603,
					message: `SSE stream error: ${error instanceof Error ? error.message : String(error)}`,
				},
			} satisfies JsonRpcErrorResponse;
		} finally {
			await response.body?.cancel().catch(() => {});
		}
	}

	/**
	 * Start the SSE listener for server-initiated messages (GET endpoint).
	 *
	 * This is best-effort — some MCP servers don't support GET for SSE.
	 * If the server returns 405 Method Not Allowed, we silently skip.
	 */
	private async _startSSEListener(): Promise<void> {
		if (this._sseAbortController) return; // Already listening

		const sseAbortController = new AbortController();
		this._sseAbortController = sseAbortController;

		const headers: Record<string, string> = {
			Accept: "text/event-stream",
			...(this._options.headers ?? {}),
		};
		if (this._sessionId) {
			headers["Mcp-Session-Id"] = this._sessionId;
		}

		let response: Response;
		try {
			response = await fetch(this._options.url, {
				method: "GET",
				headers,
				signal: sseAbortController.signal,
			});
		} catch (error) {
			this._sseAbortController = sseAbortController === this._sseAbortController ? null : this._sseAbortController;
			if (error instanceof Error && error.name !== "AbortError") {
				// Connection failed — not all servers support SSE GET
			}
			return;
		}

		// 405 Method Not Allowed means the server doesn't support SSE GET
		if (response.status === 405 || !response.ok || !response.body) {
			await response.body?.cancel().catch(() => {});
			this._sseAbortController = sseAbortController === this._sseAbortController ? null : this._sseAbortController;
			return;
		}

		void this._readSSEListener(response.body, sseAbortController);
	}

	private async _readSSEListener(
		body: ReadableStream<Uint8Array>,
		sseAbortController: AbortController,
	): Promise<void> {
		try {
			for await (const sseEvent of parseSseEvents(body, sseAbortController.signal)) {
				if (this._disconnected) break;

				const msg = parseSseJson(sseEvent.data);
				if (msg === undefined) continue;

				// Server-initiated messages from SSE
				if (isJsonRpcRequest(msg)) {
					void this._handleServerRequest(msg);
				} else if (isJsonRpcNotification(msg)) {
					this._emit({ type: "message", message: msg });
				} else if (isJsonRpcResponse(msg)) {
					// A response might come through the SSE stream if it wasn't
					// matched to a POST response (e.g., the server batched it)
					if (msg.id !== null && msg.id !== undefined) {
						const pending = this._pendingRequests.get(msg.id);
						if (pending) {
							clearTimeout(pending.timeout);
							this._pendingRequests.delete(msg.id);
							pending.resolve(msg);
						}
					}
				}
			}
		} catch {
			// SSE stream ended or was aborted
		} finally {
			this._sseAbortController = sseAbortController === this._sseAbortController ? null : this._sseAbortController;

			// If we're still connected and the SSE stream ended unexpectedly,
			// signal disconnection so the manager can handle reconnection
			if (!this._disconnected && this._status === "connected") {
				this._handleDisconnect(new Error("SSE stream ended unexpectedly"));
			}
		}
	}

	/**
	 * Handle an unexpected disconnection.
	 *
	 * Resolves all pending requests with error responses and emits
	 * a disconnected event.
	 */
	private _handleDisconnect(error: Error): void {
		this._disconnected = true;

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
