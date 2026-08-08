import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Page } from "playwright";
import { McpClientSession } from "../mcp/client.ts";
import { BrowserSession } from "../session.ts";
import type { WebProviderDescriptor } from "../types.ts";
import type { WorkerMessage, WorkerTurn } from "./protocol.ts";
import { DescriptorRunner } from "./runner.ts";

export class WorkerSession {
	private readonly browser: BrowserSession;
	private readonly runner: DescriptorRunner;
	private readonly mcps = new Map<string, McpClientSession>();
	private readonly canceled = new Set<string>();
	private closed = false;

	private constructor(browser: BrowserSession, runner: DescriptorRunner) {
		this.browser = browser;
		this.runner = runner;
	}

	static async open(profileDir: string, descriptor: WebProviderDescriptor): Promise<WorkerSession> {
		return new WorkerSession(await BrowserSession.open(profileDir), new DescriptorRunner(descriptor));
	}

	async run(turn: WorkerTurn, emit: (message: WorkerMessage) => void): Promise<void> {
		if (this.closed) throw new Error("worker session is closed");
		const mcp = await McpClientSession.open((message) => emit({ type: "mcp-request", turnId: turn.id, message }));
		mcp.bind_turn(turn.id, turn.capability);
		this.mcps.set(turn.id, mcp);
		let page: Page | undefined;
		try {
			page = await this.browser.openTurn(turn.id);
			if (this.canceled.delete(turn.id)) throw new Error("turn canceled");
			await this.runner.run(turn, page, mcp, emit);
		} finally {
			this.mcps.delete(turn.id);
			try {
				if (page) await this.browser.closeTurn(turn.id);
			} finally {
				await mcp.close();
			}
		}
	}

	cancel(turnId: string): void {
		if (!this.runner.cancel(turnId)) this.canceled.add(turnId);
	}

	resolveMcp(turnId: string, message: JSONRPCMessage): void {
		const mcp = this.mcps.get(turnId);
		if (!mcp) throw new Error(`unknown MCP turn: ${turnId}`);
		mcp.deliver(message);
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.runner.close();
		this.canceled.clear();
		try {
			await Promise.all([...this.mcps.values()].map((mcp) => mcp.close()));
		} finally {
			this.mcps.clear();
			await this.browser.close();
		}
	}
}
