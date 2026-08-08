import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	type CallToolResult,
	type JSONRPCMessage,
	ListToolsRequestSchema,
	type ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { WebMcpBridge, WebTool } from "../types.ts";
import { CapabilityError, CapabilityStore } from "./capability.ts";
import { encode, normalizeTools, toArguments, toolError } from "./codec.ts";
import { type RpcSend, RpcTransport } from "./transport.ts";

export class McpServerSession implements WebMcpBridge {
	private readonly server: Server;
	private readonly transport: RpcTransport;
	private readonly capabilities: CapabilityStore;
	private readonly tools: readonly WebTool[];
	private readonly toolMap: ReadonlyMap<string, WebTool>;
	private readonly call: (name: string, input: unknown) => Promise<unknown>;
	private readonly ready: Promise<void>;
	private turnId?: string;
	private capability?: string;
	private closed = false;

	private constructor(
		tools: readonly WebTool[],
		call: (name: string, input: unknown) => Promise<unknown>,
		send: RpcSend,
	) {
		this.tools = normalizeTools(tools);
		this.toolMap = new Map(this.tools.map((tool) => [tool.name, tool]));
		this.call = call;
		this.capabilities = new CapabilityStore();
		this.server = new Server({ name: "pi-web-runtime-host", version: "0.1.0" }, { capabilities: { tools: {} } });
		this.transport = new RpcTransport(send);
		this.server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
			this.assertBound();
			return {
				tools: this.tools.map(({ name, description, inputSchema }) => ({
					name,
					description,
					inputSchema: inputSchema as ListToolsResult["tools"][number]["inputSchema"],
				})),
			};
		});
		this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
			this.assertBound();
			const tool = this.toolMap.get(request.params.name);
			if (!tool) return toolError(`unsupported tool: ${request.params.name}`);
			try {
				const result = await this.call(tool.name, toArguments(request.params.arguments ?? {}));
				return { content: [{ type: "text", text: encode(result) }] };
			} catch (error) {
				return toolError(error instanceof Error ? error.message : String(error));
			}
		});
		this.ready = this.server.connect(this.transport);
	}

	static async open(
		tools: readonly WebTool[],
		call: (name: string, input: unknown) => Promise<unknown>,
		send: RpcSend,
	): Promise<McpServerSession> {
		const session = new McpServerSession(tools, call, send);
		await session.ready;
		return session;
	}

	issue(turnId: string, lifetimeMs: number): string {
		return this.capabilities.issue(turnId, lifetimeMs);
	}

	revoke(token: string): void {
		this.capabilities.revoke(token);
	}

	revokeTurn(turnId: string): void {
		this.capabilities.revokeTurn(turnId);
		if (this.turnId === turnId) {
			this.turnId = undefined;
			this.capability = undefined;
		}
	}

	bind_turn(turnId: string, capability: string): void {
		this.capabilities.assert(capability, turnId);
		if (this.turnId && this.turnId !== turnId) throw new CapabilityError("MCP session is already bound");
		this.turnId = turnId;
		this.capability = capability;
	}

	async list_tools(_capability: string): Promise<readonly WebTool[]> {
		this.assertBound();
		await this.ready;
		return this.tools;
	}

	async call_tool(_capability: string, name: string, input: unknown): Promise<unknown> {
		this.assertBound();
		const tool = this.toolMap.get(name);
		if (!tool) throw new CapabilityError(`unsupported tool: ${name}`);
		return this.call(tool.name, toArguments(input));
	}

	deliver(message: JSONRPCMessage): void {
		this.transport.deliver(message);
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		await this.ready.catch(() => undefined);
		await this.server.close();
	}

	private assertBound(): void {
		if (this.closed) throw new CapabilityError("MCP session is closed");
		if (!this.turnId || !this.capability) throw new CapabilityError("MCP session is not bound");
		this.capabilities.assert(this.capability, this.turnId);
	}
}
