import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult, JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { WebMcpBridge, WebTool } from "../types.ts";
import { CapabilityError } from "./capability.ts";
import { decode, readToolError, toArguments } from "./codec.ts";
import { type RpcSend, RpcTransport } from "./transport.ts";

export class McpClientSession implements WebMcpBridge {
	private readonly client: Client;
	private readonly transport: RpcTransport;
	private ready?: Promise<void>;
	private bound?: string;
	private closed = false;

	private constructor(send: RpcSend) {
		this.client = new Client({ name: "pi-web-runtime-worker", version: "0.1.0" }, { capabilities: {} });
		this.transport = new RpcTransport(send);
	}

	static create(send: RpcSend): McpClientSession {
		return new McpClientSession(send);
	}

	static async open(send: RpcSend): Promise<McpClientSession> {
		const session = McpClientSession.create(send);
		await session.open();
		return session;
	}

	async open(): Promise<void> {
		this.ready ??= this.client.connect(this.transport);
		await this.ready;
	}

	bind_turn(turnId: string, capability: string): void {
		if (!turnId || !capability) throw new CapabilityError("invalid MCP turn binding");
		if (this.bound && this.bound !== turnId) throw new CapabilityError("MCP session is already bound");
		this.bound = turnId;
	}

	async list_tools(_capability: string): Promise<readonly WebTool[]> {
		this.assertBound();
		await this.open();
		const result = await this.client.listTools();
		return result.tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema,
		}));
	}

	async call_tool(_capability: string, name: string, input: unknown): Promise<unknown> {
		this.assertBound();
		await this.open();
		const result = await this.client.callTool({ name, arguments: toArguments(input) });
		if (!("content" in result)) throw new CapabilityError("tool call returned an unsupported result");
		const content = result.content as CallToolResult["content"];
		if (result.isError) throw new CapabilityError(readToolError(content));
		return decode(content);
	}

	deliver(message: JSONRPCMessage): void {
		this.transport.deliver(message);
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		await this.ready?.catch(() => undefined);
		await this.client.close();
	}

	private assertBound(): void {
		if (this.closed) throw new CapabilityError("MCP session is closed");
		if (!this.bound) throw new CapabilityError("MCP session is not bound");
	}
}
