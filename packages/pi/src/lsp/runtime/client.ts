import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type {
	Diagnostic,
	JsonRpcMessage,
	JsonRpcNotification,
	JsonRpcRequest,
	JsonRpcResponse,
	ServerConfig,
} from "#pi/lsp/runtime/types";

const DEFAULT_TIMEOUT_MS = 20_000;
const DIAGNOSTIC_WAIT_MS = 1_000;

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

interface LspSessionOptions {
	rootPath: string;
	rootUri: string;
	workspaceName: string;
	timeoutMs?: number;
	onDiagnostics?: (uri: string, diagnostics: Diagnostic[]) => void;
}

export class LspSession {
	readonly #proc: ChildProcessWithoutNullStreams;
	readonly #pending = new Map<number, PendingRequest>();
	readonly #onDiagnostics?: (uri: string, diagnostics: Diagnostic[]) => void;
	readonly #options: LspSessionOptions;
	#nextId = 1;
	#buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
	#closed = false;

	constructor(server: ServerConfig, options: LspSessionOptions) {
		this.#options = options;
		this.#onDiagnostics = options.onDiagnostics;
		this.#proc = spawn(server.command, server.args ?? [], { stdio: "pipe", cwd: options.rootPath });
		this.#proc.stdout.on("data", (chunk: Buffer) => this.#handleData(chunk));
		this.#proc.stderr.resume();
		this.#proc.once("error", (error) => this.#rejectAll(error));
		this.#proc.once("exit", () => this.#rejectAll(new Error("LSP server exited")));
	}

	async initialize(server: ServerConfig): Promise<void> {
		await this.request("initialize", {
			processId: process.pid,
			rootUri: this.#options.rootUri,
			workspaceFolders: [{ uri: this.#options.rootUri, name: this.#options.workspaceName }],
			capabilities: {
				textDocument: {
					synchronization: { didSave: true },
					hover: { contentFormat: ["markdown", "plaintext"] },
					definition: { linkSupport: true },
					references: {},
					documentSymbol: { hierarchicalDocumentSymbolSupport: true },
					publishDiagnostics: { relatedInformation: true },
				},
				workspace: { workspaceFolders: true, symbol: {} },
			},
			initializationOptions: server.initializationOptions,
		});
		this.notify("initialized", {});
	}

	openFile(uri: string, languageId: string, text: string): void {
		this.notify("textDocument/didOpen", {
			textDocument: { uri, languageId, version: 1, text },
		});
	}

	request(
		method: string,
		params?: unknown,
		timeoutMs = this.#options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	): Promise<unknown> {
		if (this.#closed) return Promise.reject(new Error("LSP server is closed"));
		const id = this.#nextId++;
		const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#pending.delete(id);
				reject(new Error(`LSP request timed out: ${method}`));
			}, timeoutMs);
			this.#pending.set(id, { resolve, reject, timer });
			this.#write(request);
		});
	}

	notify(method: string, params?: unknown): void {
		if (this.#closed) return;
		const notification: JsonRpcNotification = { jsonrpc: "2.0", method, params };
		this.#write(notification);
	}

	waitForDiagnostics(): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, DIAGNOSTIC_WAIT_MS));
	}

	async close(): Promise<void> {
		if (this.#closed) return;
		try {
			await this.request("shutdown", undefined, 2_000);
			this.notify("exit");
		} catch {
			// Ignore shutdown errors; process cleanup below is best effort.
		}
		this.#closed = true;
		this.#proc.kill();
		this.#rejectAll(new Error("LSP server closed"));
	}

	#write(message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse): void {
		const body = JSON.stringify(message);
		this.#proc.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`);
	}

	#handleData(chunk: Buffer): void {
		this.#buffer = Buffer.concat([this.#buffer, chunk]);
		while (true) {
			const parsed = readMessage(this.#buffer);
			if (!parsed) return;
			this.#buffer = parsed.remaining;
			this.#handleMessage(parsed.message);
		}
	}

	#handleMessage(message: JsonRpcMessage): void {
		if ("method" in message) {
			if ("id" in message && typeof message.id === "number") {
				this.#handleServerRequest(message);
				return;
			}
			if (message.method === "textDocument/publishDiagnostics") {
				const params = message.params;
				if (params && typeof params === "object") {
					const record = params as Record<string, unknown>;
					if (typeof record.uri === "string" && Array.isArray(record.diagnostics)) {
						this.#onDiagnostics?.(record.uri, record.diagnostics as Diagnostic[]);
					}
				}
			}
			return;
		}
		const id = message.id;
		if (id === undefined) return;
		const pending = this.#pending.get(id);
		if (!pending) return;
		this.#pending.delete(id);
		clearTimeout(pending.timer);
		if (message.error) {
			pending.reject(new Error(message.error.message));
		} else {
			pending.resolve(message.result);
		}
	}

	#handleServerRequest(message: JsonRpcRequest): void {
		let result: unknown = null;
		if (message.method === "workspace/configuration") {
			const params = message.params;
			const itemCount =
				params && typeof params === "object" && Array.isArray((params as Record<string, unknown>).items)
					? (params as { items: unknown[] }).items.length
					: 0;
			result = Array.from({ length: itemCount }, () => null);
		}
		this.#write({ jsonrpc: "2.0", id: message.id, result });
	}

	#rejectAll(error: Error): void {
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.#pending.clear();
	}
}

function readMessage(
	buffer: Buffer<ArrayBufferLike>,
): { message: JsonRpcMessage; remaining: Buffer<ArrayBufferLike> } | null {
	const headerEnd = buffer.indexOf("\r\n\r\n");
	if (headerEnd === -1) return null;
	const header = buffer.subarray(0, headerEnd).toString("utf-8");
	const match = /^Content-Length: (\d+)$/im.exec(header);
	if (!match) throw new Error("Invalid LSP message header");
	const length = Number(match[1]);
	const bodyStart = headerEnd + 4;
	const bodyEnd = bodyStart + length;
	if (buffer.length < bodyEnd) return null;
	const parsed = JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString("utf-8")) as JsonRpcMessage;
	return { message: parsed, remaining: buffer.subarray(bodyEnd) };
}
