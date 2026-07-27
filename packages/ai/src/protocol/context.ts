import type { Message } from "#ai/protocol/message";
import type { Tool } from "#ai/protocol/tool";

export interface Context {
	systemPrompt?: string;
	messages: Message[];
	tools?: Tool[];
}
