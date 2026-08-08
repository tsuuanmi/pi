import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export type RpcSend = (message: JSONRPCMessage) => void | Promise<void>;

export class RpcTransport implements Transport {
	private readonly sendMessage: RpcSend;
	private closed = false;
	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: (message: JSONRPCMessage) => void;

	constructor(send: RpcSend) {
		this.sendMessage = send;
	}

	async start(): Promise<void> {
		if (this.closed) throw new Error("MCP transport is closed");
	}

	async send(message: JSONRPCMessage): Promise<void> {
		if (this.closed) throw new Error("MCP transport is closed");
		try {
			await this.sendMessage(message);
		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			this.onerror?.(failure);
			throw failure;
		}
	}

	deliver(message: JSONRPCMessage): void {
		if (this.closed) throw new Error("MCP transport is closed");
		this.onmessage?.(message);
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.onclose?.();
	}
}
