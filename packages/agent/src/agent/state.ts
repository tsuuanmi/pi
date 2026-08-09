import type { Model, ThinkingLevel } from "@tsuuanmi/pi-ai";
import { DEFAULT_MODEL } from "#agent/agent/defaults";
import type { Message } from "#agent/messages/types";
import { ToolRegistry } from "#agent/tool/registry";
import type { Tool } from "#agent/tool/tool";

export type AgentStatus = "idle" | "running" | "paused" | "aborted" | "failed";

export interface AgentState {
	systemPrompt: string;
	model: Model<any>;
	thinkingLevel: ThinkingLevel;
	readonly tools: readonly Tool[];
	set messages(messages: Message[]);
	get messages(): Message[];
	readonly isStreaming: boolean;
	readonly streamingMessage?: Message;
	readonly pendingToolCalls: ReadonlySet<string>;
	readonly errorMessage?: string;
}

export type MutableAgentState = Omit<
	AgentState,
	"tools" | "isStreaming" | "streamingMessage" | "pendingToolCalls" | "errorMessage"
> & {
	tools: Tool[];
	isStreaming: boolean;
	streamingMessage?: Message;
	pendingToolCalls: Set<string>;
	errorMessage?: string;
};

export function createAgentState(
	initialState?: Partial<Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">>,
): MutableAgentState {
	const tools = new ToolRegistry(initialState?.tools ?? []).list();
	let messages = initialState?.messages?.slice() ?? [];

	return {
		systemPrompt: initialState?.systemPrompt ?? "",
		model: initialState?.model ?? DEFAULT_MODEL,
		thinkingLevel: initialState?.thinkingLevel ?? "off",
		tools,
		get messages() {
			return messages;
		},
		set messages(nextMessages: Message[]) {
			messages = nextMessages.slice();
		},
		isStreaming: false,
		streamingMessage: undefined,
		pendingToolCalls: new Set<string>(),
		errorMessage: undefined,
	};
}
