import type { Page } from "playwright";
import type { McpClientSession } from "../mcp/client.ts";
import type { WebProviderDescriptor, WebTurnEvent } from "../types.ts";
import type { WorkerMessage, WorkerTurn } from "./protocol.ts";

export interface WorkerRunner {
	run(turn: WorkerTurn, page: Page, mcp: McpClientSession, emit: (message: WorkerMessage) => void): Promise<void>;
	cancel(turnId: string): boolean;
	close(): void;
}

export class DescriptorRunner implements WorkerRunner {
	private readonly descriptor: WebProviderDescriptor;
	private readonly controllers = new Map<string, AbortController>();

	constructor(descriptor: WebProviderDescriptor) {
		this.descriptor = descriptor;
	}

	async run(
		turn: WorkerTurn,
		page: Page,
		mcp: McpClientSession,
		emit: (message: WorkerMessage) => void,
	): Promise<void> {
		if (turn.provider !== this.descriptor.id) throw new Error(`unsupported web provider: ${turn.provider}`);
		if (this.controllers.has(turn.id)) throw new Error(`turn is already running: ${turn.id}`);
		const controller = new AbortController();
		this.controllers.set(turn.id, controller);
		try {
			await this.descriptor.runTurn(
				{
					page,
					mcp,
					model: turn.model,
					prompt: turn.prompt,
					attachments: turn.attachments,
					tools: turn.tools,
					signal: controller.signal,
				},
				(event) => this.handleEvent(turn, mcp, event, emit),
			);
		} finally {
			this.controllers.delete(turn.id);
		}
	}

	cancel(turnId: string): boolean {
		const controller = this.controllers.get(turnId);
		if (!controller) return false;
		controller.abort(new Error("turn canceled"));
		return true;
	}

	close(): void {
		for (const controller of this.controllers.values()) controller.abort(new Error("worker session closed"));
		this.controllers.clear();
	}

	private async handleEvent(
		turn: WorkerTurn,
		mcp: McpClientSession,
		event: WebTurnEvent,
		emit: (message: WorkerMessage) => void,
	): Promise<unknown> {
		if (event.type !== "tool-call") {
			emit({ type: "event", turnId: turn.id, event });
			return undefined;
		}
		const result = await mcp.call_tool(turn.capability, event.name, event.input);
		emit({ type: "event", turnId: turn.id, event: { type: "tool-result", id: event.id, content: result } });
		return result;
	}
}
