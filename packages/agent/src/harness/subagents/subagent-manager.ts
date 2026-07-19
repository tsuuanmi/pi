/**
 * Minimal subagent manager contract.
 *
 * @tsuuanmi/pi-coding-agent's `SubagentManager` class satisfies this interface
 * structurally; @tsuuanmi/pi-workflows programs against this lower-layer
 * contract so it does not depend on the coding-agent package.
 */
import type {
	SubagentAwaitOptions,
	SubagentAwaitResult,
	SubagentRecord,
	SubagentResumeResult,
	SubagentRunRequest,
	SubagentRunResult,
} from "#agent/harness/subagents/subagent-types";

export interface SubagentManager {
	spawn(request: SubagentRunRequest): Promise<SubagentRunResult>;
	resume(
		id: string,
		message: string,
		options: Pick<
			SubagentRunRequest,
			"agent" | "systemPrompt" | "tools" | "excludeTools" | "model" | "thinkingLevel" | "signal" | "storageSessionId"
		>,
	): Promise<SubagentResumeResult>;
	steer(id: string, message: string, delivery: "steer" | "followUp", sessionId: string): Promise<SubagentResumeResult>;
	pause(id: string, sessionId: string): Promise<{ ok: boolean; reason?: string; record?: SubagentRecord }>;
	cancel(id: string, sessionId: string): Promise<SubagentRecord | undefined>;
	read(id: string, sessionId: string): Promise<SubagentRecord | undefined>;
	list(sessionId: string): Promise<SubagentRecord[]>;
	waitFor(id: string, options: SubagentAwaitOptions): Promise<SubagentAwaitResult>;
	/** Tear down the manager: cancel all live subagents, dispose per-spawn sessions, clear the live map. Called by RuntimeOwner.stop(). */
	dispose(): Promise<void>;
}
