import type { AgentMessage } from "#agent/messages/state";
import type { Tool } from "#agent/tool/tool";

export interface AgentContext {
	systemPrompt: string;
	messages: AgentMessage[];
	tools: readonly Tool[];
}
