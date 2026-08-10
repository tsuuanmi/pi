import type {
	SubagentAwaitOptions,
	SubagentAwaitResult,
	SubagentDelivery,
	SubagentRecord,
	SubagentResumeResult,
	SubagentRunRequest,
	SubagentRunResult,
} from "#pi/subagents/types";

export interface SubagentManagerApi {
	spawn(request: SubagentRunRequest): Promise<SubagentRunResult>;
	resume(
		id: string,
		message: string,
		options: Pick<
			SubagentRunRequest,
			"agent" | "systemPrompt" | "tools" | "excludeTools" | "model" | "thinkingLevel" | "signal" | "storageSessionId"
		>,
	): Promise<SubagentResumeResult>;
	steer(id: string, message: string, delivery: SubagentDelivery, sessionId: string): Promise<SubagentResumeResult>;
	pause(id: string, sessionId: string): Promise<{ ok: boolean; reason?: string; record?: SubagentRecord }>;
	cancel(id: string, sessionId: string): Promise<SubagentRecord | undefined>;
	read(id: string, sessionId: string): Promise<SubagentRecord | undefined>;
	list(sessionId: string): Promise<SubagentRecord[]>;
	waitFor(id: string, options: SubagentAwaitOptions): Promise<SubagentAwaitResult>;
	getActiveCount(): number;
	dispose(): Promise<void>;
}
