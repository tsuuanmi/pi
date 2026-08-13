export type WorkflowExecutionMetadataValue = string | number | boolean;

export interface WorkflowSubagentSpawnInput {
	agent?: unknown;
	role?: unknown;
	model?: string;
	thinkingLevel?: string;
	systemPrompt?: string;
	tools?: readonly string[];
	excludeTools?: readonly string[];
	metadata?: unknown;
}
