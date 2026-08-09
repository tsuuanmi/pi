import type { Message } from "#agent/messages/types";
import type { Tool } from "#agent/tool/tool";

export interface Context {
	systemPrompt: string;
	messages: Message[];
	tools: readonly Tool[];
}
