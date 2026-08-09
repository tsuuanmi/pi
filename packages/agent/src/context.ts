import type { Message } from "#agent/messages/state";
import type { Tool } from "#agent/tool/tool";

export interface Context {
	systemPrompt: string;
	messages: Message[];
	tools: readonly Tool[];
}
