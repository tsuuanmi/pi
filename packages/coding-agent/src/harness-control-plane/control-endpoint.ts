import { mkdir, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { dirname } from "node:path";

export interface EndpointRequest {
	verb: string;
	input: Record<string, unknown>;
}

export class EndpointUnreachableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EndpointUnreachableError";
	}
}

export class ControlServer {
	#server: Server;
	#socketPath: string;

	constructor(socketPath: string, handler: (request: EndpointRequest) => Promise<unknown> | unknown) {
		this.#socketPath = socketPath;
		this.#server = createServer((socket) => {
			let buffer = "";
			socket.setEncoding("utf8");
			socket.on("data", (chunk) => {
				buffer += chunk;
				const index = buffer.indexOf("\n");
				if (index < 0) return;
				const line = buffer.slice(0, index).trim();
				void (async () => {
					try {
						const parsed = JSON.parse(line) as EndpointRequest;
						const response = await handler(parsed);
						socket.end(`${JSON.stringify({ ok: true, response })}\n`);
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						socket.end(`${JSON.stringify({ ok: false, error: message })}\n`);
					}
				})();
			});
		});
	}

	async listen(): Promise<void> {
		await mkdir(dirname(this.#socketPath), { recursive: true });
		await rm(this.#socketPath, { force: true });
		await new Promise<void>((resolve, reject) => {
			this.#server.once("error", reject);
			this.#server.listen(this.#socketPath, () => {
				this.#server.off("error", reject);
				resolve();
			});
		});
	}

	async close(): Promise<void> {
		await new Promise<void>((resolve) => this.#server.close(() => resolve()));
		await rm(this.#socketPath, { force: true }).catch(() => undefined);
	}
}

export async function callEndpoint(socketPath: string, request: EndpointRequest): Promise<unknown> {
	const { createConnection } = await import("node:net");
	return await new Promise((resolve, reject) => {
		const socket = createConnection(socketPath);
		let buffer = "";
		socket.setEncoding("utf8");
		socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
		socket.on("data", (chunk) => {
			buffer += chunk;
			const index = buffer.indexOf("\n");
			if (index < 0) return;
			const line = buffer.slice(0, index).trim();
			try {
				const parsed = JSON.parse(line) as { ok: boolean; response?: unknown; error?: string };
				if (parsed.ok) resolve(parsed.response);
				else reject(new Error(parsed.error ?? "endpoint_error"));
			} catch (error) {
				reject(error);
			} finally {
				socket.end();
			}
		});
		socket.on("error", (error) => reject(new EndpointUnreachableError(error.message)));
	});
}
