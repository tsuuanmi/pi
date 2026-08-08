import type { Page } from "playwright";

export interface WebProviderModel {
	id: string;
	name: string;
	contextWindow: number;
	input: readonly ("text" | "image" | "file")[];
	output: readonly ("text" | "reasoning" | "tool")[];
}

export interface WebAttachment {
	name: string;
	mediaType: string;
	data: Uint8Array;
}

export interface WebTurn {
	page: Page;
	mcp: WebMcpBridge;
	model: string;
	prompt: string;
	attachments: readonly WebAttachment[];
	tools: readonly WebTool[];
	signal: AbortSignal;
}

export interface WebTool {
	name: string;
	description?: string;
	inputSchema: unknown;
}

export type WebTurnEvent =
	| { type: "text"; text: string }
	| { type: "reasoning"; text: string }
	| { type: "tool-call"; id: string; name: string; input: unknown }
	| { type: "tool-result"; id: string; content: unknown }
	| { type: "done"; usage?: { inputTokens?: number; outputTokens?: number } };

export interface WebProviderEntitlement {
	routes: readonly string[];
}

export interface WebProviderDescriptor {
	readonly id: string;
	readonly name: string;
	readonly models: readonly WebProviderModel[];
	readonly worker: string;
	verify(profileDir: string, signal: AbortSignal): Promise<WebProviderEntitlement>;
	runTurn(turn: WebTurn, emit: (event: WebTurnEvent) => Promise<unknown>): Promise<void>;
}

export interface WebMcpBridge {
	bind_turn(turnId: string, capability: string): void;
	list_tools(capability: string): Promise<readonly WebTool[]>;
	call_tool(capability: string, name: string, input: unknown): Promise<unknown>;
}
