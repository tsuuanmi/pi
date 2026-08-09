export interface AgentRunOptions {
	signal?: AbortSignal;
	metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
	success: boolean;
	output: string;
	structured?: unknown;
	error?: unknown;
}
