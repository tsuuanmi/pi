import type { AgentMessage } from "#agent/messages/types";
import type { Tool } from "#agent/tool/tool";

export interface Context {
	systemPrompt: string;
	messages: AgentMessage[];
	tools: readonly Tool[];
}
